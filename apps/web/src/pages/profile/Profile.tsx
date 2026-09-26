import { useState, useEffect, useRef } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useGetUserByUsername, useFollowUser } from '@workspace/api-client-react';
import { useAuthStore } from '@/store/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { PostCard } from '@/components/post/PostCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AchievementBadgeRow from '@/components/profile/AchievementBadgeRow';
import WritingStreakWidget from '@/components/profile/WritingStreakWidget';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin, Link as LinkIcon, Calendar, UserPlus, UserCheck, Briefcase, Plus, Trash2,
  Eye, EyeOff, Lock, Upload, Image as ImageIcon, Loader2, Handshake, DollarSign,
  Pencil, X, ExternalLink, Sparkles, GraduationCap, Globe, Facebook, Linkedin, Twitter, Instagram,
  ShieldCheck, AlertTriangle, BarChart3, MessageCircle, Users, Zap, Rocket, TrendingUp, Clock, Flame, Camera,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { apiUrl, getStoredToken, mediaUrl } from '@/lib/api';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import { useT } from '@/lib/i18n';
import { ReputationTimeline } from '@/components/trust/ReputationTimeline';
import { CreatorLevelBadge, CreatorLevelProgressPanel } from '@/components/trust/CreatorLevelBadge';
import { BackButton } from '@/components/ui/BackButton';
import { ReportDialog } from '@/components/report/ReportDialog';

interface PortfolioItem {
  id: number; userId: number; title: string; description?: string | null;
  mediaUrl: string; category: string; visibility: string; createdAt: string;
}
interface CreatorProfile {
  skills: string[]; links: { label: string; url: string }[];
  verified: boolean; isAvailableForHire: boolean; availableFor: string[];
}

interface CreatorPublicStats {
  creatorLevel: string;
  trustTier: string;
  uti: number;
  writingStreak: number;
  longestStreak: number;
  achievementCount: number;
  postCount: number;
  portfolioCount: number;
  weeklyFollowerGrowth: number;
}

interface BoostRequest {
  id: number;
  status: string;
  plan: string;
  postTitle?: string;
  boostEndsAt?: string;
  createdAt: string;
  adminNote?: string;
}

interface EducationEntry {
  id: number;
  school: string;
  degree: string;
  field?: string | null;
  startYear: number;
  endYear?: number | null;
  description?: string | null;
}

interface ProfilePost {
  id: number;
  authorId?: number;
  type: string;
  title?: string | null;
  content?: string | null;
  excerpt?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  likesCount?: number;
  commentsCount?: number;
  isLiked?: boolean;
  isPublished?: boolean;
  attachments?: unknown;
}

function hasVideoAttachment(post: ProfilePost) {
  if (post.type === 'video') return true;
  const attachments = typeof post.attachments === 'string'
    ? (() => { try { return JSON.parse(post.attachments as string); } catch { return []; } })()
    : post.attachments;
  if (!Array.isArray(attachments)) return false;
  return attachments.some((attachment) => {
    if (typeof attachment === 'string') return /\.(mp4|mov|webm|m4v|ogv)(?:$|\?)/i.test(attachment);
    if (!attachment || typeof attachment !== 'object') return false;
    const item = attachment as { type?: string; mimeType?: string; url?: string };
    return item.type === 'video'
      || item.mimeType?.startsWith('video/')
      || !!item.url && /\.(mp4|mov|webm|m4v|ogv)(?:$|\?)/i.test(item.url);
  });
}

interface ExtendedProfileData {
  user: {
    id: number;
    username: string;
    email: string;
    displayName: string;
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    website?: string | null;
    location?: string | null;
    country?: string | null;
    headline?: string | null;
    identityType?: string | null;
    facebook?: string | null;
    linkedin?: string | null;
    twitter?: string | null;
    instagram?: string | null;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    isFollowing: boolean;
    createdAt: string;
    isPremium?: boolean;
    isOfficialAccount?: boolean;
  };
  recentPosts: ProfilePost[];
  workHistory: {
    id: number;
    title: string;
    organization: string;
    startYear: number;
    endYear?: number | null;
    description?: string | null;
  }[];
  educationHistory?: EducationEntry[];
}

const AVAILABLE_FOR_OPTIONS = [
  { id: 'collaborations', label: 'Collaborations', displayLabel: 'Collaboration Ready',          icon: '🤝' },
  { id: 'commissions',    label: 'Commissions',    displayLabel: 'Available for Commissions',    icon: '💰' },
  { id: 'freelance',      label: 'Freelance',      displayLabel: 'Accepting Creative Projects',  icon: '🧑‍💻' },
  { id: 'beta_readers',   label: 'Beta Readers',   displayLabel: 'Seeking Beta Readers',         icon: '📖' },
  { id: 'editing',        label: 'Editing',        displayLabel: 'Accepting Editing Work',       icon: '✏️' },
  { id: 'sponsorships',   label: 'Sponsorships',   displayLabel: 'Available for others to find', icon: '🌟' },
];

export default function Profile() {
  const [, profileParams] = useRoute('/profile/:username');
  const [, publicParams] = useRoute('/u/:username');
  const [location, navigate] = useLocation();
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const username = profileParams?.username || publicParams?.username || currentUser?.username || '';
  const { toast } = useToast();
  const t = useT();
  const isMe = currentUser?.username === username;
  const token = getStoredToken();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleImageUpload(file: File, type: 'avatar' | 'cover') {
    const setLoading = type === 'avatar' ? setUploadingAvatar : setUploadingCover;
    setLoading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
        reader.readAsDataURL(file);
      });

      const res = await fetch(apiUrl('/api/upload'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          dataBase64,
          category: 'profile',
        }),
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const url = mediaUrl(data.url ?? data.secure_url);
      const field = type === 'avatar' ? 'avatarUrl' : 'coverUrl';

      const profileRes = await fetch(apiUrl('/api/users/me/profile'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ [field]: url }),
      });
      if (!profileRes.ok) throw new Error('Profile update failed');

      queryClient.setQueryData(['/api/users/' + username], (previous: ExtendedProfileData | undefined) => (
        previous
          ? { ...previous, user: { ...previous.user, [field]: url } }
          : previous
      ));
      const authUser = useAuthStore.getState().user;
      if (authUser && isMe) {
        useAuthStore.setState({ user: { ...authUser, [field]: url } });
      }

      toast({ title: `${type === 'avatar' ? 'Profile' : 'Cover'} photo updated` });
      void refetch();
    } catch {
      toast({ title: 'Upload failed. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const getCategoryLabel = (category: string) => {
    const map: Record<string, string> = {
      general: t('profile.categoryGeneral', 'General'),
      writing: t('profile.categoryWriting', 'Writing'),
      photography: t('profile.categoryPhotography', 'Photography'),
      illustration: t('profile.categoryIllustration', 'Illustration'),
      design: t('profile.categoryDesign', 'Design'),
      music: t('profile.categoryMusic', 'Music'),
    };
    return map[category] ?? category;
  };

  const { data: rawData, isLoading, refetch } = useGetUserByUsername(username);
  const data = rawData as ExtendedProfileData | undefined;
  const { mutate: toggleFollow, isPending: isFollowing } = useFollowUser({ mutation: { onSuccess: () => refetch() } });

  // Service listings state
  interface ServiceListing {
    id: number;
    title: string;
    description: string;
    category: string;
    pricingModel: string;
    priceFrom: number | null;
    priceTo: number | null;
    currency: string;
    deliveryDays: number | null;
    skills: string[];
    isActive: boolean;
  }
  const [serviceListings, setServiceListings] = useState<ServiceListing[]>([]);
  const [endorsements, setEndorsements] = useState<Record<string, number>>({});

  // Portfolio state
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [addPortfolioOpen, setAddPortfolioOpen] = useState(false);
  const [portfolioForm, setPortfolioForm] = useState({ title: '', description: '', mediaUrl: '', category: 'general', visibility: 'public' });
  const [isSavingPortfolio, setIsSavingPortfolio] = useState(false);
  const [viewItem, setViewItem] = useState<PortfolioItem | null>(null);
  const [profileContentPosts, setProfileContentPosts] = useState<ProfilePost[]>([]);
  const [profileContentLoading, setProfileContentLoading] = useState(false);

  // Creator profile state
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile>({ skills: [], links: [], verified: false, isAvailableForHire: false, availableFor: [] });
  const [isEditCreatorOpen, setIsEditCreatorOpen] = useState(false);
  const [creatorForm, setCreatorForm] = useState({ skills: '', links: '', isAvailableForHire: false, availableFor: [] as string[] });
  const [isSavingCreator, setIsSavingCreator] = useState(false);

  // Trust state
  const [profileTrust, setProfileTrust] = useState<{ tier: string; uti: number; creatorLevel?: string } | null>(null);

  // Collaboration state
  const [isCollaborateOpen, setIsCollaborateOpen] = useState(false);
  const [collaborateMsg, setCollaborateMsg] = useState('');
  const [isSendingCollab, setIsSendingCollab] = useState(false);

  useEffect(() => {
    const action = new URLSearchParams(location.split("?")[1] ?? "").get("action");
    if (action === "collaborate" && !isMe && data?.user?.id) setIsCollaborateOpen(true);
  }, [location, isMe, data?.user?.id]);

  // Creator public stats (visible to everyone)
  const [creatorPublicStats, setCreatorPublicStats] = useState<CreatorPublicStats | null>(null);

  const [boostRequests, setBoostRequests] = useState<BoostRequest[]>([]);
  const [boostsLoading, setBoostsLoading] = useState(false);

  const fetchPortfolio = async (userId: number) => {
    setPortfolioLoading(true);
    try {
      const res = await fetch(`/api/gallery/${userId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json = await res.json();
      setPortfolioItems(json.items || []);
    } catch { setPortfolioItems([]); }
    finally { setPortfolioLoading(false); }
  };

  useEffect(() => {
    if (data?.user?.username) {
      fetch(`/api/services/creator/${data.user.username}`)
        .then(r => r.ok ? r.json() : [])
        .then((listings: ServiceListing[]) => setServiceListings(Array.isArray(listings) ? listings : []))
        .catch(() => {});
      fetch(`/api/users/${data.user.username}/endorsements`)
        .then(r => r.ok ? r.json() : { endorsements: [] })
        .then((d: { endorsements: Array<{ skill: string; count: number }> }) => {
          const map: Record<string, number> = {};
          const endorsements = Array.isArray(d?.endorsements) ? d.endorsements : [];
          endorsements.forEach((e) => { map[e.skill] = e.count; });
          setEndorsements(map);
        })
        .catch(() => {});
    }
    if (data?.user?.id) {
      fetchPortfolio(data.user.id);
      setProfileContentLoading(true);
      fetch(`/api/users/${encodeURIComponent(data.user.username)}/posts?limit=100`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : { posts: [] })
        .then(d => {
          const posts = Array.isArray(d?.posts) ? d.posts : [];
          setProfileContentPosts(posts.filter((post: ProfilePost) => post.authorId === data.user.id));
        })
        .catch(() => setProfileContentPosts([]))
        .finally(() => setProfileContentLoading(false));
      fetch(`/api/trust/${data.user.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setProfileTrust({ tier: d.tier, uti: Math.round(d.uti ?? 0), creatorLevel: d.creatorLevel }); })
        .catch(() => {});
      if (isMe) {
        setBoostsLoading(true);
        fetch('/api/boost/my', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          .then(r => r.ok ? r.json() : null)
          .then(d => setBoostRequests(
            Array.isArray(d) ? d : Array.isArray(d?.requests) ? d.requests : []
          ))
          .catch(() => {})
          .finally(() => setBoostsLoading(false));
      }
    }
    const cp = (data as { creatorProfile?: CreatorProfile })?.creatorProfile;
    if (cp) setCreatorProfile(cp);

    if (data?.user?.username) {
      fetch(`/api/analytics/creator/${data.user.username}/stats`)
        .then(r => r.ok ? r.json() : null)
        .then((d: CreatorPublicStats | null) => { if (d) setCreatorPublicStats(d); })
        .catch(() => {});
    }
  }, [data?.user?.id]);

  const openEditCreator = () => {
    setCreatorForm({
      skills: creatorProfile.skills.join(', '),
      links: creatorProfile.links.map(l => `${l.label}|${l.url}`).join('\n'),
      isAvailableForHire: creatorProfile.isAvailableForHire,
      availableFor: creatorProfile.availableFor || [],
    });
    setIsEditCreatorOpen(true);
  };

  const handleSaveCreator = async () => {
    setIsSavingCreator(true);
    try {
      const skills = creatorForm.skills.split(',').map(s => s.trim()).filter(Boolean);
      const links = creatorForm.links.split('\n').map(l => {
        const [label, url] = l.split('|');
        if (!label || !url) return null;
        const cleanUrl = url.trim();
        return { label: label.trim(), url: /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}` };
      }).filter(Boolean) as { label: string; url: string }[];

      const res = await fetch('/api/users/me/creator', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ skills, links, isAvailableForHire: creatorForm.isAvailableForHire, availableFor: creatorForm.availableFor }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setCreatorProfile({ ...updated, skills: updated.skills || [], links: updated.links || [], availableFor: updated.availableFor || [] });
      toast({ title: t('profile.creatorProfileUpdated', 'Creator profile updated!') });
      setIsEditCreatorOpen(false);
    } catch { toast({ title: t('profile.creatorProfileUpdateFailed', 'Failed to update creator profile'), variant: 'destructive' }); }
    finally { setIsSavingCreator(false); }
  };

  const handleHireMe = async () => {
    if (!data?.user?.id) return;
    try {
      const startRes = await fetch('/api/messages/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ userId: data.user.id }),
      });
      const startJson = await startRes.json();
      const convId = startJson.conversationId;
      if (convId) {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ conversationId: convId, content: `Hi ${data.user.displayName}, I'm interested in hiring you for a project!`, type: 'hire_request' }),
        });
      }
      navigate(`/messages?conv=${convId}`);
    } catch { toast({ title: t('profile.couldNotOpenChat', 'Could not open chat'), variant: 'destructive' }); }
  };

  const handleCollaborate = async () => {
    if (!data?.user?.id || !collaborateMsg.trim()) return;
    setIsSendingCollab(true);
    try {
      const res = await fetch('/api/collaboration/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ receiverId: data.user.id, message: collaborateMsg }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: t('profile.collaborationRequestSent', 'Collaboration request sent!') });
      setIsCollaborateOpen(false);
      setCollaborateMsg('');
    } catch { toast({ title: t('profile.collaborationRequestFailed', 'Failed to send request'), variant: 'destructive' }); }
    finally { setIsSendingCollab(false); }
  };

  const handleAddPortfolio = async () => {
    if (!portfolioForm.title || !portfolioForm.mediaUrl) {
      toast({ title: t('profile.portfolioRequired', 'Title and image are required'), variant: 'destructive' }); return;
    }
    setIsSavingPortfolio(true);
    try {
      const res = await fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(portfolioForm),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: t('profile.portfolioItemAdded', 'Portfolio item added!') });
      setAddPortfolioOpen(false);
      setPortfolioForm({ title: '', description: '', mediaUrl: '', category: 'general', visibility: 'public' });
      if (data?.user?.id) fetchPortfolio(data.user.id);
    } catch { toast({ title: t('profile.portfolioAddFailed', 'Failed to add item'), variant: 'destructive' }); }
    finally { setIsSavingPortfolio(false); }
  };

  const handleDeletePortfolio = async (id: number) => {
    try {
      await fetch(`/api/gallery/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      setPortfolioItems(prev => prev.filter(p => p.id !== id));
      toast({ title: t('profile.deleted', 'Deleted.') });
    } catch { toast({ title: t('profile.deleteFailed', 'Failed to delete'), variant: 'destructive' }); }
  };

  const visibilityIcon = (v: string) => {
    if (v === 'private') return <Lock className="w-3 h-3" />;
    if (v === 'followers') return <EyeOff className="w-3 h-3" />;
    return <Eye className="w-3 h-3" />;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="w-full h-64 bg-muted animate-pulse rounded-b-3xl" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative -top-16">
          <Skeleton className="w-32 h-32 rounded-full border-4 border-background" />
          <div className="mt-4 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-32" /></div>
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return <AppLayout><div className="py-20 text-center text-muted-foreground">{t('profile.userNotFound', 'User not found')}</div></AppLayout>;
  }

  const { user, recentPosts, workHistory } = data;
  const educationHistory: EducationEntry[] = Array.isArray(data.educationHistory)
    ? data.educationHistory
    : [];
  const artworkPosts = recentPosts.filter(p => p.type === 'artwork');
  const sparkPosts = profileContentPosts.filter(post => post.type === 'spark');
  const motionPosts = profileContentPosts.filter(hasVideoAttachment);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4">
        <BackButton />
      </div>
      {/* Cover Photo */}
      <div className="w-full h-48 md:h-72 bg-muted relative md:rounded-b-3xl overflow-hidden shadow-sm">
        {user.coverUrl ? (
          <img src={mediaUrl(user.coverUrl)} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <img src={`${import.meta.env.BASE_URL}images/default-cover.png`} alt="Default Cover" className="w-full h-full object-cover opacity-80" />
        )}
        {isMe && (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file, 'cover');
              }}
            />
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs font-medium bg-black/60 text-white px-3 py-1.5 rounded-full hover:bg-black/75 transition-colors"
            >
              {uploadingCover ? 'Uploading...' : 'Change cover'}
            </button>
          </>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -top-16 md:-top-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="flex items-end gap-4">
            <Avatar className="relative w-32 h-32 md:w-40 md:h-40 border-4 border-background shadow-xl">
              <AvatarImage src={mediaUrl(user.avatarUrl)} />
              <AvatarFallback className="text-4xl bg-primary/10 text-primary font-serif">
                {user.displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
              {isMe && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'avatar');
                    }}
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </Avatar>
            {creatorProfile.verified && (
              <Badge className="mb-2 bg-primary/10 text-primary border-primary/30 gap-1.5">
                <Sparkles className="w-3 h-3" /> {t('profile.verifiedCreator', 'Verified Creator')}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isMe ? (
              <>
                <Link href="/settings">
                  <Button variant="outline" className="rounded-xl border-border/80">{t('profile.editProfile', 'Edit Profile')}</Button>
                </Link>
                <Link href={`/portfolio/${user.username}`}>
                  <Button variant="outline" className="rounded-xl gap-2" data-testid="button-view-portfolio">
                    <Briefcase className="w-4 h-4" /> {t('profile.viewPortfolio', 'View Portfolio')}
                  </Button>
                </Link>
                <Button variant="outline" onClick={openEditCreator} className="rounded-xl gap-2">
                  <Pencil className="w-4 h-4" /> {t('profile.creatorProfile', 'Creator Profile')}
                </Button>
                <Link href="/inbox">
                  <Button variant="outline" className="rounded-xl gap-2">
                    <Handshake className="w-4 h-4" /> {t('profile.collabInbox', 'Collab Inbox')}
                  </Button>
                </Link>
              </>
            ) : (
              <>
                {creatorProfile.isAvailableForHire && (
                  <Button onClick={handleHireMe} className="rounded-xl gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/30 font-semibold">
                    <Zap className="w-4 h-4" /> {t('profile.inviteToCollaborate', 'Message about a project')}
                  </Button>
                )}
                <Button onClick={() => setIsCollaborateOpen(true)} variant="outline" className="rounded-xl gap-2 border-primary/50 text-primary hover:bg-primary/5">
                  <Handshake className="w-4 h-4" /> {t('profile.collaborate', 'Request collaboration')}
                </Button>
                {currentUser && (
                  <Button onClick={handleHireMe} variant="outline" className="rounded-xl gap-2 border-border/60 hover:border-primary/40">
                    <MessageCircle className="w-4 h-4" /> {t('profile.message', 'Message')}
                  </Button>
                )}
                <Button
                  onClick={() => toggleFollow({ username })}
                  disabled={isFollowing}
                  className={`rounded-xl shadow-md transition-all ${user.isFollowing ? 'bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground' : 'bg-primary text-primary-foreground hover:-translate-y-0.5'}`}
                >
                  {user.isFollowing ? <><UserCheck className="w-4 h-4 mr-2" />{t('profile.following', 'Following')}</> : <><UserPlus className="w-4 h-4 mr-2" />{t('profile.follow', 'Follow')}</>}
                </Button>
                <ReportDialog targetType="user" targetId={user.id} label="Report" />
              </>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-serif font-bold text-foreground">{user.displayName}</h1>
            <CreatorLevelBadge level={creatorPublicStats?.creatorLevel ?? (profileTrust as { creatorLevel?: string } | null)?.creatorLevel} size="sm" />
            {creatorProfile.isAvailableForHire && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold border border-amber-300 dark:border-amber-700">
                <Zap className="w-3.5 h-3.5" />
                {t('profile.openToOpportunities', '⚡ Available for others to find')}
              </span>
            )}
            {(creatorProfile.availableFor || []).map(af => {
              const opt = AVAILABLE_FOR_OPTIONS.find(o => o.id === af);
              if (!opt) return null;
              return (
                <span key={af} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-medium border border-violet-200 dark:border-violet-800">
                  {opt.icon} {opt.displayLabel}
                </span>
              );
            })}
          </div>

          {/* Creator Momentum Indicators */}
          {creatorPublicStats && (() => {
            const indicators: { label: string; color: string }[] = [];
            if (creatorPublicStats.weeklyFollowerGrowth >= 5) indicators.push({ label: '⚡ Fast Growing', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' });
            if (creatorPublicStats.writingStreak >= 30) indicators.push({ label: '🔥 Dedicated Writer', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700' });
            else if (creatorPublicStats.writingStreak >= 7) indicators.push({ label: '✍️ Consistent Creator', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700' });
            if (creatorPublicStats.achievementCount >= 5) indicators.push({ label: '🏆 Highly Decorated', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-700' });
            if (creatorPublicStats.creatorLevel === 'luminary') indicators.push({ label: '👑 Platform Luminary', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700' });
            else if (creatorPublicStats.creatorLevel === 'featured') indicators.push({ label: '⭐ Featured Creator', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-700' });
            if (profileTrust?.tier === 'trusted') indicators.push({ label: '🛡️ Trusted Contributor', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700' });
            if (indicators.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 mt-1">
                {indicators.map(ind => (
                  <span key={ind.label} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ind.color}`}>
                    {ind.label}
                  </span>
                ))}
              </div>
            );
          })()}
          {user.headline && (
            <p className="text-base font-medium text-primary/90 mt-0.5 mb-1">{user.headline}</p>
          )}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-lg text-muted-foreground">@{user.username}</p>
            {user.identityType && (() => {
              const identityLabels: Record<string, string> = {
                everyone: t('profile.member', 'Member'), reader: t('profile.reader', 'Reader'), writer: t('profile.writer', 'Writer'), artist: t('profile.artist', 'Artist'),
                professional: t('profile.professional', 'Professional'), student: t('profile.student', 'Student'), builder: t('profile.builder', 'Builder'), community: t('profile.community', 'Community'),
              };
              const label = identityLabels[user.identityType ?? ''];
              if (!label) return null;
              return (
                <Badge variant="outline" className="text-xs rounded-full px-2.5 py-0.5 bg-primary/5 text-primary border-primary/30">
                  {label}
                </Badge>
              );
            })()}
          </div>

          {user.bio ? (
            <p className="text-foreground/90 max-w-2xl mb-4 leading-relaxed">{user.bio}</p>
          ) : isMe ? (
            <div className="mb-4 flex max-w-2xl flex-col gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Tell people a little about yourself</p>
                <p className="mt-1 text-sm text-muted-foreground">A short bio helps your voice stand out in the hive.</p>
              </div>
              <Link href="/settings">
                <Button variant="outline" size="sm" className="w-full rounded-xl sm:w-auto">Add a bio</Button>
              </Link>
            </div>
          ) : null}

          {/* Skills */}
          {creatorProfile.skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {creatorProfile.skills.map(skill => (
                <div key={skill} className="flex items-center gap-1">
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-sm font-medium bg-primary/8 text-primary border-primary/20">
                    {skill}
                    {(endorsements[skill] ?? 0) > 0 && (
                      <span className="ml-1.5 text-xs font-bold text-primary/60">{endorsements[skill]}</span>
                    )}
                  </Badge>
                  {!isMe && token && (
                    <button
                      onClick={async () => {
                        if (!token) return;
                        await fetch(`/api/users/${username}/endorse`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ skill }),
                        });
                        setEndorsements(prev => ({ ...prev, [skill]: (prev[skill] ?? 0) + 1 }));
                        toast({ title: `${t('profile.endorseSkill', 'Endorsed')} ${skill} ✓` });
                      }}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-full px-2 py-0.5"
                      title={`${t('profile.endorseSkill', 'Endorse')} ${skill}`}
                    >
                      +1
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Links */}
          {creatorProfile.links.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {creatorProfile.links.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
                  <ExternalLink className="w-3.5 h-3.5" /> {link.label}
                </a>
              ))}
            </div>
          )}

          {isMe && creatorProfile.skills.length === 0 && creatorProfile.links.length === 0 && (
            <button onClick={openEditCreator} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1.5 mb-4 transition-colors">
              <Plus className="w-3.5 h-3.5" /> {t('profile.addSkillsLinks', 'Add skills and links to your profile')}
            </button>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
            {user.location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {user.location}{user.country ? `, ${user.country}` : ''}</span>}
            {!user.location && user.country && <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" /> {user.country}</span>}
            {user.website && (
              <a href={user.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                <LinkIcon className="w-4 h-4" /> {user.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {t('profile.joined', 'Joined')} {format(new Date(user.createdAt), 'MMM yyyy')}</span>
          </div>

          {/* Social Links */}
          {(user.facebook || user.linkedin || user.twitter || user.instagram) && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {user.facebook && <a href={user.facebook} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center hover:scale-110 transition-transform" aria-label="Facebook"><Facebook className="w-4 h-4 text-blue-600" /></a>}
              {user.linkedin && <a href={user.linkedin} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center hover:scale-110 transition-transform" aria-label="LinkedIn"><Linkedin className="w-4 h-4 text-blue-700" /></a>}
              {user.twitter && <a href={user.twitter} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:scale-110 transition-transform" aria-label="Twitter"><Twitter className="w-4 h-4 text-slate-700 dark:text-slate-300" /></a>}
              {user.instagram && <a href={user.instagram} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800 flex items-center justify-center hover:scale-110 transition-transform" aria-label="Instagram"><Instagram className="w-4 h-4 text-pink-600" /></a>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex flex-col"><span className="text-xl font-bold text-foreground">{user.followersCount}</span><span className="text-sm text-muted-foreground">{t('profile.followers', 'Followers')}</span></div>
            <div className="flex flex-col"><span className="text-xl font-bold text-foreground">{user.followingCount}</span><span className="text-sm text-muted-foreground">{t('profile.following', 'Following')}</span></div>
            {creatorPublicStats && creatorPublicStats.postCount > 0 && (
              <div className="flex flex-col"><span className="text-xl font-bold text-foreground">{creatorPublicStats.postCount}</span><span className="text-sm text-muted-foreground">{t('profile.posts', 'Posts')}</span></div>
            )}
            {creatorPublicStats && creatorPublicStats.portfolioCount > 0 && (
              <div className="flex flex-col"><span className="text-xl font-bold text-foreground">{creatorPublicStats.portfolioCount}</span><span className="text-sm text-muted-foreground">{t('profile.works', 'Works')}</span></div>
            )}
            {creatorPublicStats && creatorPublicStats.writingStreak > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20">
                <Flame className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{creatorPublicStats.writingStreak} day streak</p>
                  <p className="text-xs text-muted-foreground">Best: {creatorPublicStats.longestStreak} days</p>
                </div>
              </div>
            )}
            {profileTrust && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-muted/20">
                {profileTrust.tier === 'trusted' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                ) : profileTrust.tier === 'restricted' ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-semibold text-foreground capitalize">
                    {profileTrust.tier === 'trusted' ? t('profile.trustedContributor', 'Trusted Contributor') :
                     profileTrust.tier === 'restricted' ? t('profile.restricted', 'Restricted') :
                     profileTrust.tier === 'limited' ? t('profile.buildingTrust', 'Building Trust') : t('profile.activeMember', 'Active Member')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('profile.trustScore', 'Trust Score')} {profileTrust.uti}/100</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {profileTrust && creatorPublicStats && (
          <div className="mb-6">
            <CreatorLevelProgressPanel
              level={creatorPublicStats.creatorLevel}
              uti={profileTrust.uti}
            />
          </div>
        )}

        {/* Growth CTA for owner */}
        {isMe && (
          <div className="mb-6 bg-gradient-to-r from-primary/8 via-violet-500/5 to-transparent border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Grow your creator presence</p>
                <p className="text-xs text-muted-foreground truncate">Post, get discovered, and boost your reach across QuillHive.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/write">
                <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                  <Zap className="w-3.5 h-3.5" /> Post
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm" className="rounded-xl text-xs gap-1.5 bg-gradient-to-r from-primary to-violet-500 border-0 text-white">
                  <Rocket className="w-3.5 h-3.5" /> Boost
                </Button>
              </Link>
            </div>
          </div>
        )}

        {data?.user?.username && (
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <AchievementBadgeRow username={data.user.username} isMe={isMe} />
            <WritingStreakWidget username={isMe ? undefined : data.user.username} />
          </div>
        )}

        {/* Profile Tabs */}
        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0 mb-8 h-auto gap-8 overflow-x-auto hide-scrollbar">
            {[
              { value: 'posts', label: t('profile.recentPosts', 'Recent Posts') },
              { value: 'sparks', label: 'Sparks' },
              { value: 'motion', label: 'Motion' },
              { value: 'portfolio', label: t('profile.portfolio', 'Portfolio') },
              { value: 'gallery', label: t('profile.gallery', 'Gallery') },
              { value: 'experience', label: t('profile.experience', 'Experience') },
              { value: 'education', label: t('profile.education', 'Education') },
              ...(isMe || serviceListings.length > 0 ? [{ value: 'services', label: t('profile.servicesTab', 'Services') }] : []),
              ...(isMe ? [{ value: 'reputation', label: t('profile.reputation', 'Reputation') }] : []),
              ...(isMe ? [{ value: 'boosts', label: t('profile.boosts', 'My Boosts') }] : []),
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 pt-2 text-base data-[state=active]:text-foreground text-muted-foreground font-medium whitespace-nowrap">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="posts" className="space-y-6 focus-visible:outline-none">
            {recentPosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-10 bg-muted/20 rounded-2xl">{t('profile.noPostsYet', 'This person has no posts yet.')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {recentPosts.map((post) => <PostCard key={post.id} post={post as import('@workspace/api-client-react').Post & { authorTrustTier?: string; authorCreatorLevel?: string | null; authorHireEnabled?: boolean }} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sparks" className="space-y-6 focus-visible:outline-none">
            {profileContentLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
              </div>
            ) : sparkPosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-10 bg-muted/20 rounded-2xl">This person has no Sparks yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sparkPosts.map(post => <PostCard key={post.id} post={post as import('@workspace/api-client-react').Post & { authorTrustTier?: string; authorCreatorLevel?: string | null; authorHireEnabled?: boolean }} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="motion" className="space-y-6 focus-visible:outline-none">
            {profileContentLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
              </div>
            ) : motionPosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-10 bg-muted/20 rounded-2xl">This person has no Motion content yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {motionPosts.map(post => <PostCard key={post.id} post={post as import('@workspace/api-client-react').Post & { authorTrustTier?: string; authorCreatorLevel?: string | null; authorHireEnabled?: boolean }} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="portfolio" className="focus-visible:outline-none">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-serif font-semibold">{t('profile.portfolio', 'Portfolio')}</h2>
              {isMe && (
                <Button size="sm" onClick={() => setAddPortfolioOpen(true)} className="rounded-xl gap-2">
                  <Plus className="w-4 h-4" /> {t('profile.addItemShort', 'Add Item')}
                </Button>
              )}
            </div>
            {portfolioLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
              </div>
            ) : portfolioItems.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-3xl border border-dashed border-border">
                <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">{t('profile.noPortfolioItems', 'No portfolio items yet.')}</p>
                {isMe && <p className="text-sm text-muted-foreground mt-1">{t('profile.portfolioEmptyDesc', 'Add your best work to showcase your talent.')}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {portfolioItems.map(item => (
                  <div key={item.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-muted cursor-pointer" onClick={() => setViewItem(item)}>
                    <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={e => { (e.target as HTMLImageElement).src = ''; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-white text-sm font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="secondary" className="text-xs py-0 h-4">{item.category}</Badge>
                          <span className="text-white/70 ml-auto">{visibilityIcon(item.visibility)}</span>
                        </div>
                      </div>
                    </div>
                    {isMe && (
                      <button onClick={e => { e.stopPropagation(); handleDeletePortfolio(item.id); }}
                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Dialog open={addPortfolioOpen} onOpenChange={setAddPortfolioOpen}>
              <DialogContent className="sm:max-w-md rounded-2xl">
                <DialogHeader><DialogTitle className="font-serif text-xl">{t('profile.addItem', 'Add Portfolio Item')}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2"><Label>{t('profile.titleLabel', 'Title')}</Label><Input placeholder={t('profile.portfolioTitlePlaceholder', 'e.g., Midnight Bloom')} value={portfolioForm.title} onChange={e => setPortfolioForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl" /></div>
                  <div className="space-y-2"><Label>{t('profile.descriptionLabel', 'Description')}</Label><Textarea placeholder={t('profile.portfolioDescriptionPlaceholder', 'Tell us about this piece...')} value={portfolioForm.description} onChange={e => setPortfolioForm(f => ({ ...f, description: e.target.value }))} className="rounded-xl" /></div>
                  <ImageUploadField value={portfolioForm.mediaUrl} onChange={mediaUrl => setPortfolioForm(f => ({ ...f, mediaUrl }))} category="profile" label={t('profile.chooseArtwork', 'Choose artwork image')} previewClassName="aspect-video" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('profile.categoryLabel', 'Category')}</Label>
                      <Select value={portfolioForm.category} onValueChange={v => setPortfolioForm(f => ({ ...f, category: v }))}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['general','writing','photography','illustration','design','music'].map(c => (
                            <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('profile.visibilityLabel', 'Visibility')}</Label>
                      <Select value={portfolioForm.visibility} onValueChange={v => setPortfolioForm(f => ({ ...f, visibility: v }))}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">{t('common.public', 'Public')}</SelectItem>
                          <SelectItem value="followers">{t('profile.followers', 'Followers')}</SelectItem>
                          <SelectItem value="private">{t('common.private', 'Private')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddPortfolioOpen(false)} className="rounded-xl">{t('common.cancel', 'Cancel')}</Button>
                  <Button onClick={handleAddPortfolio} disabled={isSavingPortfolio} className="rounded-xl">
                    {isSavingPortfolio ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />} {t('settings.saveBtn', 'Save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!viewItem} onOpenChange={o => { if (!o) setViewItem(null); }}>
              <DialogContent className="sm:max-w-2xl rounded-2xl p-0 overflow-hidden">
                {viewItem && (
                  <>
                    <div className="aspect-video bg-muted"><img src={viewItem.mediaUrl} alt={viewItem.title} className="w-full h-full object-cover" /></div>
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-serif font-bold">{viewItem.title}</h3>
                          {viewItem.description && <p className="text-muted-foreground mt-2">{viewItem.description}</p>}
                        </div>
                        <Badge variant="outline" className="shrink-0">{getCategoryLabel(viewItem.category)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">{format(new Date(viewItem.createdAt), 'MMM d, yyyy')}</p>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="gallery" className="focus-visible:outline-none">
            {artworkPosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-10 bg-muted/20 rounded-2xl">{t('profile.noArtworkYet', 'No artwork uploaded yet.')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {artworkPosts.map((post) => (
                  <div key={post.id} className="aspect-square rounded-xl overflow-hidden bg-muted group relative">
                    <img src={post.imageUrl || ''} alt={post.title || ''} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white font-medium px-4 text-center truncate w-full">{post.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="experience" className="focus-visible:outline-none">
            {workHistory.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-2xl">
                <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground">{t('profile.noWorkExperience', 'No work experience listed.')}</p>
                {isMe && <Link href="/settings?tab=experience"><Button size="sm" variant="outline" className="mt-3 rounded-xl gap-2"><Plus className="w-4 h-4" /> {t('profile.addExperience', 'Add Experience')}</Button></Link>}
              </div>
            ) : (
              <div className="space-y-4">
                {workHistory.map((work) => (
                  <div key={work.id} className="flex gap-4 p-4 md:p-5 bg-card border border-border/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5"><Briefcase className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-lg text-foreground">{work.title}</p>
                          <p className="font-medium text-primary">{work.organization}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{work.startYear} - {work.endYear || t('profile.present', 'Present')}</p>
                        </div>
                      </div>
                      {work.description && <p className="text-sm text-muted-foreground mt-2">{work.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="education" className="focus-visible:outline-none">
            {educationHistory.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-2xl">
                <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground">{t('profile.noEducation', 'No education listed yet.')}</p>
                {isMe && <Link href="/settings?tab=education"><Button size="sm" variant="outline" className="mt-3 rounded-xl gap-2"><Plus className="w-4 h-4" /> {t('profile.addEducation', 'Add Education')}</Button></Link>}
              </div>
            ) : (
              <div className="space-y-4">
                {educationHistory.map((edu) => (
                  <div key={edu.id} className="flex gap-4 p-4 md:p-5 bg-card border border-border/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/30 text-violet-600 flex items-center justify-center shrink-0 mt-0.5"><GraduationCap className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-lg text-foreground">{edu.school}</p>
                      <p className="font-medium text-primary">{edu.degree}{edu.field ? ` · ${edu.field}` : ''}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{edu.startYear} - {edu.endYear || t('profile.present', 'Present')}</p>
                      {edu.description && <p className="text-sm text-muted-foreground mt-2">{edu.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="services" className="focus-visible:outline-none">
            {serviceListings.length === 0 && isMe ? (
              <div className="text-center py-12">
                <Briefcase className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {t('profile.noServicesYet', 'You have no active service listings')}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {t('profile.addServicesDesc', 'List your services to attract clients and commissions')}
                </p>
                <Link href="/settings?section=services">
                  <Button size="sm" variant="outline" className="rounded-xl gap-2">
                    <Plus className="w-4 h-4" />
                    {t('profile.addService', 'Add a service')}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {serviceListings.map(listing => {
                  const skills = Array.isArray(listing.skills) ? listing.skills : (typeof listing.skills === 'string' ? JSON.parse(listing.skills as string) : []);
                  const totalEndorsements = Object.values(endorsements).reduce((sum, n) => sum + n, 0);
                  return (
                    <div key={listing.id} className="border border-border rounded-2xl p-4 md:p-5 bg-card hover:shadow-lg hover:border-primary/30 transition-all">
                      {/* Creator identity strip */}
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={user.avatarUrl || ''} />
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {user.displayName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{user.displayName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">@{user.username}</p>
                        </div>
                        <CreatorLevelBadge level={creatorPublicStats?.creatorLevel ?? (profileTrust as { creatorLevel?: string } | null)?.creatorLevel} size="xs" />
                        {profileTrust?.tier === 'trusted' && (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="Trusted Contributor" />
                        )}
                      </div>

                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-foreground line-clamp-1">{listing.title}</h3>
                          <Badge variant="outline" className="text-[10px] mt-1 rounded-full">{listing.category}</Badge>
                        </div>
                        {(listing.priceFrom || listing.priceTo) && (
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-sm font-semibold text-primary">
                              {listing.priceFrom ? `${listing.currency} ${listing.priceFrom}` : ''}
                              {listing.priceFrom && listing.priceTo ? '–' : ''}
                              {listing.priceTo ? `${listing.priceTo}` : ''}
                            </p>
                            <p className="text-[10px] text-muted-foreground capitalize">{listing.pricingModel}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{listing.description}</p>
                      {skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {skills.slice(0, 4).map((skill: string) => (
                            <span key={skill} className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">{skill}</span>
                          ))}
                        </div>
                      )}

                      {/* Trust metrics */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3">
                        {totalEndorsements > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {totalEndorsements} endorsement{totalEndorsements !== 1 ? 's' : ''}
                          </span>
                        )}
                        {listing.deliveryDays && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {listing.deliveryDays}d delivery
                          </span>
                        )}
                        {creatorPublicStats && creatorPublicStats.postCount > 0 && (
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> {creatorPublicStats.postCount} posts
                          </span>
                        )}
                      </div>

                      {!isMe && (
                        <Button size="sm" className="w-full rounded-xl text-xs bg-primary/5 border-primary/20 text-primary hover:bg-primary/10" variant="outline"
                          onClick={() => navigate(`/messages?new=${username}`)}>
                          <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                          {t('profile.requestCommission', 'Request this service')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {isMe && (
            <TabsContent value="reputation" className="focus-visible:outline-none">
              <div className="mb-6">
                <h2 className="text-xl font-serif font-semibold mb-1">{t('profile.reputationTimeline', 'Reputation Timeline')}</h2>
                <p className="text-sm text-muted-foreground">{t('profile.reputationDesc', 'Your trust score history and reputation events')}</p>
              </div>
              <ReputationTimeline userId={String(data?.user?.id ?? "")} />
            </TabsContent>
          )}

          {isMe && (
            <TabsContent value="boosts" className="focus-visible:outline-none">
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-xl font-serif font-semibold flex items-center gap-2">
                      <Rocket className="w-5 h-5 text-primary" /> {t('profile.myBoosts', 'My Boosts')}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">{t('profile.boostsDesc', 'Active, pending, and past boost requests')}</p>
                  </div>
                  <Link href="/pricing">
                    <Button size="sm" className="rounded-xl gap-2 bg-gradient-to-r from-violet-600 to-purple-500 text-white border-0 shadow-sm">
                      <Rocket className="w-3.5 h-3.5" /> {t('profile.requestBoost', 'Request Boost')}
                    </Button>
                  </Link>
                </div>

                {boostsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-[76px] rounded-2xl" />)}
                  </div>
                ) : boostRequests.length === 0 ? (
                  <div className="text-center py-16 bg-muted/20 rounded-3xl border border-dashed border-border">
                    <Rocket className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                    <p className="font-medium text-muted-foreground">{t('profile.noBoostsYet', 'No boosts yet')}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t('profile.boostsEmptyDesc', 'Boost a post to increase its reach across QuillHive')}</p>
                    <Link href="/pricing">
                      <Button size="sm" className="mt-4 rounded-xl gap-2" variant="outline">
                        <Zap className="w-3.5 h-3.5" /> {t('profile.viewBoostPlans', 'View Boost Plans')}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {boostRequests.map((boost) => {
                      const now = new Date();
                      const endsAt = boost.boostEndsAt ? new Date(boost.boostEndsAt) : null;
                      const isActive = boost.status === 'approved' && endsAt && endsAt > now;
                      const isCompleted = boost.status === 'approved' && (!endsAt || endsAt <= now);
                      const isPending = boost.status === 'pending';
                      const isRejected = boost.status === 'rejected';

                      const PLAN_LABELS: Record<string, string> = {
                        starter: '⚡ Starter Boost',
                        growth: '🚀 Growth Boost',
                        spotlight: '🌟 Spotlight',
                      };
                      const planLabel = PLAN_LABELS[boost.plan as string] ?? boost.plan;

                      return (
                        <div
                          key={boost.id}
                          className={`rounded-2xl border p-4 flex items-center justify-between gap-4 transition-colors ${
                            isActive
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : isPending
                              ? 'border-amber-500/30 bg-amber-500/5'
                              : 'border-border/60 bg-card'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isActive
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : isPending
                                  ? 'bg-amber-500/15 text-amber-500'
                                  : isRejected
                                  ? 'bg-red-500/15 text-red-500'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {isActive ? <Zap className="w-5 h-5" /> : isPending ? <Clock className="w-5 h-5" /> : <Rocket className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">{planLabel}</p>
                              {boost.postTitle && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">"{boost.postTitle}"</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t('profile.boostRequested', 'Requested')} {format(new Date(boost.createdAt), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right space-y-1.5">
                            {isActive && (
                              <>
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold">
                                  ● {t('profile.boostActive', 'Active')}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {t('profile.boostEnds', 'Ends')} {formatDistanceToNow(endsAt!, { addSuffix: true })}
                                </p>
                              </>
                            )}
                            {isPending && (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold">
                                {t('profile.boostPending', 'Pending Review')}
                              </Badge>
                            )}
                            {isCompleted && (
                              <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
                                {t('profile.boostCompleted', 'Completed')}
                              </Badge>
                            )}
                            {isRejected && (
                              <>
                                <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-semibold">
                                  {t('profile.boostDeclined', 'Declined')}
                                </Badge>
                                {boost.adminNote && (
                                  <p className="text-xs text-muted-foreground max-w-[180px] truncate" title={boost.adminNote}>
                                    {boost.adminNote}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Collaborate Modal */}
      <Dialog open={isCollaborateOpen} onOpenChange={setIsCollaborateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" /> {t('profile.collaborateWith', 'Collaborate with')} {user?.displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">{t('profile.collaborateDesc', 'Describe your collaboration idea.')} {user?.displayName} {t('profile.collaborateDescTail', 'will receive your request and can accept or decline.')}</p>
            <Textarea
              placeholder={t('profile.collaboratePlaceholder', `Hi ${user?.displayName}, I'd love to collaborate on...`)}
              value={collaborateMsg}
              onChange={e => setCollaborateMsg(e.target.value)}
              className="rounded-xl min-h-[120px] resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCollaborateOpen(false)} className="rounded-xl">{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleCollaborate} disabled={isSendingCollab || !collaborateMsg.trim()} className="rounded-xl gap-2">
              {isSendingCollab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Handshake className="w-4 h-4" />} {t('profile.sendRequest', 'Send Request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Creator Profile Modal */}
      <Dialog open={isEditCreatorOpen} onOpenChange={setIsEditCreatorOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> {t('profile.profile', 'Profile')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-5">
            <div className="space-y-2">
              <Label>{t('profile.skillsLabel', 'Skills')} <span className="text-muted-foreground text-xs">{t('profile.commaSeparated', '(comma-separated)')}</span></Label>
              <Input
                placeholder={t('profile.skillsPlaceholder', 'e.g., Writing, Photography, Illustration')}
                value={creatorForm.skills}
                onChange={e => setCreatorForm(f => ({ ...f, skills: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('profile.linksLabel', 'Links')} <span className="text-muted-foreground text-xs">{t('profile.onePerLine', '(one per line: Label|URL)')}</span></Label>
              <Textarea
                placeholder={t('profile.linksPlaceholder', "Portfolio|https://mysite.com\nInstagram|https://instagram.com/me")}
                value={creatorForm.links}
                onChange={e => setCreatorForm(f => ({ ...f, links: e.target.value }))}
                className="rounded-xl font-mono text-sm min-h-[100px] resize-none"
              />
            </div>
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <input
                type="checkbox"
                id="hire-toggle"
                checked={creatorForm.isAvailableForHire}
                onChange={e => setCreatorForm(f => ({ ...f, isAvailableForHire: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600"
              />
              <div>
                <label htmlFor="hire-toggle" className="font-medium text-sm cursor-pointer text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> {t('profile.openToOpportunities', 'Open to opportunities')}
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('profile.opportunityReadyDesc', 'Let people find you when you are available for creative work')}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('profile.creatorAvailability', 'Availability')}</p>
              <p className="text-xs text-muted-foreground">{t('profile.availabilityDesc', 'Select what types of creative work you\'re available for. These appear as badges on your profile.')}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {AVAILABLE_FOR_OPTIONS.map(opt => {
                  const isSelected = creatorForm.availableFor.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCreatorForm(f => ({
                        ...f,
                        availableFor: isSelected
                          ? f.availableFor.filter(id => id !== opt.id)
                          : [...f.availableFor, opt.id],
                      }))}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700'
                          : 'bg-muted text-muted-foreground border-border hover:border-violet-300'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditCreatorOpen(false)} className="rounded-xl">{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleSaveCreator} disabled={isSavingCreator} className="rounded-xl gap-2">
              {isSavingCreator ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {t('settings.saveBtn', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
