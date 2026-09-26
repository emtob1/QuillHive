import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/store/auth';
import { useUpdateMyProfile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiUrl, getStoredToken, mediaUrl } from '@/lib/api';
import { useI18n, useT, SUPPORTED_LANGS } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CreatorModeToggle } from '@/components/settings/CreatorModeToggle';
import { SessionsCard } from '@/components/settings/SessionsCard';
import { BackButton } from '@/components/ui/BackButton';
import {
  User, Lock, Bell, Palette, Shield, Trash2, Moon, Sun, ChevronRight, Save, Loader2, Eye, Globe, Link2,
  MessageCircle, GraduationCap, Briefcase, Plus, Pencil, X, Upload, Camera, Facebook, Linkedin,
  Twitter, Instagram, KeyRound, Smartphone, Download, AlertTriangle, Gift, CreditCard, Rocket,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react';

type Section = 'profile' | 'account' | 'security' | 'privacy' | 'experience' | 'education' | 'notifications' | 'appearance' | 'connectedApps' | 'language' | 'invites' | 'warnings' | 'blocked' | 'billing' | 'apiKeys' | 'danger';

interface WorkEntry { id: number; title: string; organization: string; startYear: number; endYear?: number | null; description?: string | null; }
interface EduEntry { id: number; school: string; degree: string; field?: string | null; startYear: number; endYear?: number | null; description?: string | null; }

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Cambodia','Cameroon',
  'Canada','Chile','China','Colombia','Croatia','Cuba','Cyprus','Czech Republic','Denmark',
  'Dominican Republic','Ecuador','Egypt','El Salvador','Estonia','Ethiopia','Fiji','Finland','France',
  'Germany','Ghana','Greece','Guatemala','Haiti','Honduras','Hungary','Iceland','India','Indonesia',
  'Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya',
  'Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Libya','Lithuania','Luxembourg','Madagascar',
  'Malaysia','Maldives','Mali','Malta','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro',
  'Morocco','Mozambique','Myanmar','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
  'North Korea','Norway','Oman','Pakistan','Panama','Paraguay','Peru','Philippines','Poland',
  'Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia','Singapore',
  'Slovakia','Slovenia','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka',
  'Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia','Turkey',
  'Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay',
  'Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

async function uploadFile(file: File, token: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch(apiUrl('/api/upload'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, dataBase64: base64, category: 'profile' }),
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        resolve(mediaUrl(data.url ?? data.secure_url));
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  usePageTitle('Settings');
  const { user, setUser } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getStoredToken();
  const [activeSection, setActiveSection] = useState<Section>('profile');
  const { lang: currentLang, setLang } = useI18n();
  const t = useT();
  const [language, setLanguage] = useState(currentLang || (user as any)?.lang || localStorage.getItem('qh_lang') || 'en');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    headline: (user as any)?.headline || '',
    identityType: (user as any)?.identityType || null,
    location: user?.location || '',
    country: (user as any)?.country || '',
    website: user?.website || '',
    avatarUrl: user?.avatarUrl || '',
    coverUrl: user?.coverUrl || '',
    facebook: (user as any)?.facebook || '',
    linkedin: (user as any)?.linkedin || '',
    twitter: (user as any)?.twitter || '',
    instagram: (user as any)?.instagram || '',
    profileVisibility: (user as any)?.profileVisibility || 'public',
    showEmail: (user as any)?.showEmail ?? false,
    showWebsite: (user as any)?.showWebsite ?? true,
    showLocation: (user as any)?.showLocation ?? true,
  });

  type NotifPrefs = Record<string, { inApp: boolean; push: boolean; email: boolean }>;
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null);
  const [isLoadingNotifPrefs, setIsLoadingNotifPrefs] = useState(false);
  const [isSavingNotifPref, setIsSavingNotifPref] = useState(false);
  const [creatorSettings, setCreatorSettings] = useState({
    emailDigestEnabled: (user as any)?.emailDigestEnabled ?? true,
    topicNotificationEnabled: (user as any)?.topicNotificationEnabled ?? true,
    hireMeEnabled: (user as any)?.hireMeEnabled ?? false,
  });
  const [isSavingCreatorSettings, setIsSavingCreatorSettings] = useState(false);
  const [isSavingAccountInfo, setIsSavingAccountInfo] = useState(false);

  const [workHistory, setWorkHistory] = useState<WorkEntry[]>([]);
  const [educationHistory, setEducationHistory] = useState<EduEntry[]>([]);
  const [isLoadingWork, setIsLoadingWork] = useState(false);
  const [isLoadingEdu, setIsLoadingEdu] = useState(false);

  // Security / 2FA state
  const [twofaStatus, setTwofaStatus] = useState<{ enabled: boolean } | null>(null);
  const [twofaSecret, setTwofaSecret] = useState<string | null>(null);
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaBusy, setTwofaBusy] = useState(false);

  // Account deletion state
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Privacy preferences (persisted via /api/users/me/privacy)
  type PrivacyPrefs = {
    profileVisibility: 'public' | 'private' | 'followers';
    showEmail: boolean;
    showWebsite: boolean;
    showLocation: boolean;
    showPostsToEveryone: boolean;
    allowMessagesFromAnyone: boolean;
    showInSearch: boolean;
  };
  const [privacy, setPrivacy] = useState<PrivacyPrefs>({
    profileVisibility: 'public',
    showEmail: false,
    showWebsite: true,
    showLocation: true,
    showPostsToEveryone: true,
    allowMessagesFromAnyone: false,
    showInSearch: true,
  });
  const [privacyLoaded, setPrivacyLoaded] = useState(false);
  const [privacySaving, setPrivacySaving] = useState<string | null>(null);

  // Passkeys state
  type Passkey = { id: number; deviceName: string | null; createdAt: string; lastUsedAt: string | null };
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyAdding, setPasskeyAdding] = useState(false);

  const fetch2faStatus = async () => {
    try {
      const res = await fetch('/api/auth/2fa/status', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setTwofaStatus(await res.json());
    } catch {}
  };

  const fetchPrivacy = async () => {
    try {
      const res = await fetch('/api/users/me/privacy', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const data = await res.json();
        setPrivacy((p) => ({ ...p, ...data }));
        setPrivacyLoaded(true);
      }
    } catch {}
  };

  const updatePrivacy = async <K extends keyof PrivacyPrefs>(key: K, value: PrivacyPrefs[K]) => {
    const previous = privacy;
    setPrivacy((p) => ({ ...p, [key]: value }));
    setPrivacySaving(String(key));
    try {
      const res = await fetch('/api/users/me/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setPrivacy((p) => ({ ...p, ...data }));
    } catch {
      setPrivacy(previous);
      toast({ title: t('settings.couldNotSavePrivacy'), variant: 'destructive' });
    } finally {
      setPrivacySaving(null);
    }
  };

  const fetchPasskeys = async () => {
    setPasskeysLoading(true);
    try {
      const res = await fetch('/api/auth/passkey', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const data = await res.json();
        setPasskeys(Array.isArray(data?.passkeys) ? data.passkeys : []);
      }
    } catch {} finally {
      setPasskeysLoading(false);
    }
  };

  const addPasskey = async () => {
    if (!('credentials' in navigator) || typeof window.PublicKeyCredential === 'undefined') {
      toast({ title: t('settings.passkeyNotSupported'), variant: 'destructive' });
      return;
    }
    setPasskeyAdding(true);
    try {
      const optsRes = await fetch('/api/auth/passkey/registration-options', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!optsRes.ok) throw new Error('Could not start passkey registration');
      const { challengeId, publicKeyOptions } = await optsRes.json();
      const b64uToBuf = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)).buffer;
      const opts: any = { ...publicKeyOptions, challenge: b64uToBuf(publicKeyOptions.challenge), user: { ...publicKeyOptions.user, id: new TextEncoder().encode(String(publicKeyOptions.user.id)) } };
      const cred = (await navigator.credentials.create({ publicKey: opts })) as any;
      if (!cred) throw new Error('Cancelled');
      const bufToB64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const credentialId = bufToB64u(cred.rawId);
      const publicKey = bufToB64u(cred.response.getPublicKey ? cred.response.getPublicKey() : cred.response.attestationObject);
      const transports = Array.isArray(cred.response.getTransports?.())
        ? cred.response.getTransports()
        : [];
      const deviceName = `${navigator.platform || 'Device'} · ${new Date().toLocaleDateString()}`;
      const reg = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ challengeId, credentialId, publicKey, transports, deviceName }),
      });
      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        throw new Error(err?.error || 'Passkey registration failed');
      }
      toast({ title: t('settings.passkeyAdded') });
      await fetchPasskeys();
    } catch (e: any) {
      toast({ title: t('settings.couldNotAddPasskey'), description: e?.message, variant: 'destructive' });
    } finally {
      setPasskeyAdding(false);
    }
  };

  const removePasskey = async (id: number) => {
    try {
      const res = await fetch(`/api/auth/passkey/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Delete failed');
      setPasskeys((ps) => ps.filter((p) => p.id !== id));
    } catch {
      toast({ title: t('settings.couldNotRemovePasskey'), variant: 'destructive' });
    }
  };

  const setup2fa = async () => {
    setTwofaBusy(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setTwofaSecret(data.secret || data.otpauth || null);
    } catch (e: any) {
      toast({ title: e?.message || t('settings.failedToStartTwoFA'), variant: 'destructive' });
    } finally { setTwofaBusy(false); }
  };

  const enable2fa = async () => {
    if (!twofaCode || twofaCode.length !== 6) { toast({ title: t('settings.enterSixDigitCode'), variant: 'destructive' }); return; }
    setTwofaBusy(true);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ token: twofaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('settings.enterSixDigitCode'));
      toast({ title: t('settings.twoFaEnabled') });
      setTwofaSecret(null);
      setTwofaCode('');
      fetch2faStatus();
    } catch (e: any) {
      toast({ title: e?.message || t('settings.failedToEnableTwoFA'), variant: 'destructive' });
    } finally { setTwofaBusy(false); }
  };

  const disable2fa = async () => {
    if (!twofaCode || twofaCode.length !== 6) { toast({ title: t('settings.enterCodeToConfirm'), variant: 'destructive' }); return; }
    setTwofaBusy(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ token: twofaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast({ title: t('settings.twoFaDisabled') });
      setTwofaCode('');
      fetch2faStatus();
    } catch (e: any) {
      toast({ title: e?.message || t('settings.failedToDisableTwoFA'), variant: 'destructive' });
    } finally { setTwofaBusy(false); }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/auth/me/export', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Failed to export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quillhive-export-${user?.id || 'me'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t('settings.exportDownloaded') });
    } catch (e: any) {
      toast({ title: e?.message || t('settings.exportFailed'), variant: 'destructive' });
    } finally { setIsExporting(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast({ title: t('settings.typeDeleteToConfirm'), variant: 'destructive' });
      return;
    }
    setIsDeletingAccount(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok) throw new Error('Failed');
      localStorage.removeItem('qh_token');
      localStorage.removeItem('qh_refresh_token');
      window.location.href = '/login';
    } catch (e: any) {
      toast({ title: e?.message || t('settings.failedToDeleteAccount'), variant: 'destructive' });
      setIsDeletingAccount(false);
    }
  };

  const [workDialog, setWorkDialog] = useState<{ open: boolean; editing?: WorkEntry }>({ open: false });
  const [workForm, setWorkForm] = useState({ title: '', organization: '', startYear: new Date().getFullYear(), endYear: '', description: '' });
  const [isSavingWork, setIsSavingWork] = useState(false);

  const [eduDialog, setEduDialog] = useState<{ open: boolean; editing?: EduEntry }>({ open: false });
  const [eduForm, setEduForm] = useState({ school: '', degree: '', field: '', startYear: new Date().getFullYear(), endYear: '', description: '' });
  const [isSavingEdu, setIsSavingEdu] = useState(false);

  const { mutate: updateProfile, isPending: isSaving } = useUpdateMyProfile({
    mutation: {
      onSuccess: (updatedUser) => {
        setUser(updatedUser as any);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        toast({ title: t('settings.profileSaved'), description: t('settings.yourChangesSaved') });
      },
      onError: () => toast({ title: t('settings.errorSavingProfileTitle'), description: t('settings.failedToSaveProfile'), variant: 'destructive' }),
    }
  });

  const handleSaveAccountInfo = async () => {
    setIsSavingAccountInfo(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ username: profileForm.username.trim(), displayName: profileForm.displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('settings.failedToSaveProfile'));
      setUser(data);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: t('settings.accountSaved', 'Account information saved'), description: t('settings.yourChangesSaved') });
    } catch (error: any) {
      toast({ title: error?.message || t('settings.failedToSaveProfile'), variant: 'destructive' });
    } finally {
      setIsSavingAccountInfo(false);
    }
  };

  const fetchWorkHistory = async () => {
    setIsLoadingWork(true);
    try {
      const res = await fetch('/api/users/me/work-history', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setWorkHistory(await res.json());
    } catch { } finally { setIsLoadingWork(false); }
  };

  const fetchEducation = async () => {
    setIsLoadingEdu(true);
    try {
      const res = await fetch('/api/users/me/education', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setEducationHistory(await res.json());
    } catch { } finally { setIsLoadingEdu(false); }
  };

  const loadNotifPrefs = async () => {
    if (isLoadingNotifPrefs) return;
    setIsLoadingNotifPrefs(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json() as { preferences: Record<string, { inApp: boolean; push: boolean; email: boolean }> };
        setNotifPrefs(data.preferences);
      }
    } catch { /* silent */ } finally { setIsLoadingNotifPrefs(false); }
  };

  const patchNotifPref = async (type: string, channel: 'inApp' | 'push' | 'email', value: boolean) => {
    setNotifPrefs(prev => prev ? { ...prev, [type]: { ...(prev[type] ?? { inApp: true, push: false, email: false }), [channel]: value } } : prev);
    if (isSavingNotifPref) return;
    setIsSavingNotifPref(true);
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type, channel, enabled: value }),
      });
    } catch { /* silent */ } finally { setIsSavingNotifPref(false); }
  };

  useEffect(() => {
    if (activeSection === 'experience') fetchWorkHistory();
    if (activeSection === 'education') fetchEducation();
    if (activeSection === 'security') {
      fetch2faStatus();
      fetchPasskeys();
    }
    if (activeSection === 'privacy' && !privacyLoaded) fetchPrivacy();
    if (activeSection === 'notifications' && !notifPrefs && !isLoadingNotifPrefs) void loadNotifPrefs();
  }, [activeSection]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast({ title: t('settings.pleaseSelectImage'), variant: 'destructive' }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: t('settings.imageMustBeUnder5MB'), variant: 'destructive' }); return; }
    setIsUploadingAvatar(true);
    try {
      const url = await uploadFile(file, token);
      setProfileForm(f => ({ ...f, avatarUrl: url }));
      updateProfile({ data: { ...profileForm, avatarUrl: url } as any });
      toast({ title: t('settings.avatarUploaded') });
    } catch { toast({ title: t('settings.uploadFailed'), variant: 'destructive' }); }
    finally { setIsUploadingAvatar(false); }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast({ title: t('settings.pleaseSelectImage'), variant: 'destructive' }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: t('settings.imageMustBeUnder10MB'), variant: 'destructive' }); return; }
    setIsUploadingCover(true);
    try {
      const url = await uploadFile(file, token);
      setProfileForm(f => ({ ...f, coverUrl: url }));
      updateProfile({ data: { ...profileForm, coverUrl: url } as any });
      toast({ title: t('settings.coverPhotoUploaded') });
    } catch { toast({ title: t('settings.uploadFailed'), variant: 'destructive' }); }
    finally { setIsUploadingCover(false); }
  };

  const openAddWork = () => { setWorkForm({ title: '', organization: '', startYear: new Date().getFullYear(), endYear: '', description: '' }); setWorkDialog({ open: true }); };
  const openEditWork = (entry: WorkEntry) => { setWorkForm({ title: entry.title, organization: entry.organization, startYear: entry.startYear, endYear: entry.endYear ? String(entry.endYear) : '', description: entry.description || '' }); setWorkDialog({ open: true, editing: entry }); };
  const handleSaveWork = async () => {
    if (!workForm.title || !workForm.organization || !workForm.startYear) { toast({ title: t('settings.titleOrgYearRequired'), variant: 'destructive' }); return; }
    setIsSavingWork(true);
    try {
      const body = { title: workForm.title, organization: workForm.organization, startYear: Number(workForm.startYear), endYear: workForm.endYear ? Number(workForm.endYear) : null, description: workForm.description || null };
      const url = workDialog.editing ? `/api/users/me/work-history/${workDialog.editing.id}` : '/api/users/me/work-history';
      const res = await fetch(url, { method: workDialog.editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast({ title: workDialog.editing ? t('settings.updated') : t('settings.added') });
      setWorkDialog({ open: false });
      fetchWorkHistory();
    } catch { toast({ title: t('settings.uploadFailed'), variant: 'destructive' }); }
    finally { setIsSavingWork(false); }
  };
  const handleDeleteWork = async (id: number) => {
    try { await fetch(`/api/users/me/work-history/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} }); setWorkHistory(p => p.filter(w => w.id !== id)); toast({ title: t('settings.deleted') }); }
    catch { toast({ title: t('settings.failedToDeleteAccount'), variant: 'destructive' }); }
  };

  const openAddEdu = () => { setEduForm({ school: '', degree: '', field: '', startYear: new Date().getFullYear(), endYear: '', description: '' }); setEduDialog({ open: true }); };
  const openEditEdu = (entry: EduEntry) => { setEduForm({ school: entry.school, degree: entry.degree, field: entry.field || '', startYear: entry.startYear, endYear: entry.endYear ? String(entry.endYear) : '', description: entry.description || '' }); setEduDialog({ open: true, editing: entry }); };
  const handleSaveEdu = async () => {
    if (!eduForm.school || !eduForm.degree || !eduForm.startYear) { toast({ title: t('settings.schoolDegreeYearRequired'), variant: 'destructive' }); return; }
    setIsSavingEdu(true);
    try {
      const body = { school: eduForm.school, degree: eduForm.degree, field: eduForm.field || null, startYear: Number(eduForm.startYear), endYear: eduForm.endYear ? Number(eduForm.endYear) : null, description: eduForm.description || null };
      const url = eduDialog.editing ? `/api/users/me/education/${eduDialog.editing.id}` : '/api/users/me/education';
      const res = await fetch(url, { method: eduDialog.editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast({ title: eduDialog.editing ? t('settings.updated') : t('settings.added') });
      setEduDialog({ open: false });
      fetchEducation();
    } catch { toast({ title: t('settings.uploadFailed'), variant: 'destructive' }); }
    finally { setIsSavingEdu(false); }
  };
  const handleDeleteEdu = async (id: number) => {
    try { await fetch(`/api/users/me/education/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} }); setEducationHistory(p => p.filter(e => e.id !== id)); toast({ title: t('settings.deleted') }); }
    catch { toast({ title: t('settings.failedToDeleteAccount'), variant: 'destructive' }); }
  };

  const sections = [
    { id: 'profile' as Section, icon: User, label: t('settings.profile') },
    { id: 'account' as Section, icon: Lock, label: t('settings.account') },
    { id: 'security' as Section, icon: KeyRound, label: t('settings.security', 'Security') },
    { id: 'privacy' as Section, icon: Shield, label: t('settings.privacy') },
    { id: 'experience' as Section, icon: Briefcase, label: t('settings.workExperience') },
    { id: 'education' as Section, icon: GraduationCap, label: t('settings.educationSection') },
    { id: 'notifications' as Section, icon: Bell, label: t('settings.notifications') },
    { id: 'appearance' as Section, icon: Palette, label: t('settings.appearance') },
    { id: 'connectedApps' as Section, icon: Link2, label: t('settings.connectedApps', 'Connected Apps') },
    { id: 'language' as Section, icon: Globe, label: t('settings.language') },
    { id: 'invites' as Section, icon: User, label: t('settings.inviteFriends') },
    { id: 'warnings' as Section, icon: AlertTriangle, label: t('settings.warnings') },
    { id: 'blocked' as Section, icon: Eye, label: t('settings.blockedUsers') },
    { id: 'billing' as Section, icon: CreditCard, label: 'Billing & Boosts' },
    ...((user as { role?: string } | null)?.role === 'super_admin' ? [{ id: 'apiKeys' as Section, icon: KeyRound, label: t('settings.apiKeys') }] : []),
    { id: 'danger' as Section, icon: Trash2, label: t('settings.deleteAccount'), danger: true },
  ];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 md:px-0 py-4">
        <BackButton />
        <h1 className="text-3xl font-serif font-bold mb-8">{t('settings.title')}</h1>

        <div className="flex flex-col md:flex-row gap-6">
          <nav className="md:w-64 shrink-0">
            <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
              {sections.map((s, i) => {
                const Icon = s.icon;
                const isActive = activeSection === s.id;
                return (
                  <button key={s.id} onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors
                      ${i > 0 ? 'border-t border-border/40' : ''}
                      ${isActive ? 'bg-primary/10 text-primary' : (s as any).danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-medium text-sm">{s.label}</span>
                    <ChevronRight className={`w-3 h-3 ml-auto ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-card border border-border/60 rounded-2xl shadow-sm p-6">

              {/* PROFILE SECTION */}
              {activeSection === 'profile' && (
                <div className="space-y-6">
                  <div><h2 className="text-xl font-semibold mb-1">{t('settings.profileSectionTitle')}</h2><p className="text-sm text-muted-foreground">{t('settings.profileSectionDesc')}</p></div>
                  <Separator />

                  {/* Photo uploads */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('settings.profilePhotos')}</h3>
                    <div>
                      <Label className="mb-2 block">{t('settings.coverPhoto')}</Label>
                      <div className="relative w-full h-32 rounded-xl overflow-hidden bg-muted border border-border group cursor-pointer" onClick={() => coverInputRef.current?.click()}>
                        {profileForm.coverUrl ? <img src={mediaUrl(profileForm.coverUrl)} alt="Cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Camera className="w-8 h-8" /></div>}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          {isUploadingCover ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Upload className="w-6 h-6 text-white" />}
                        </div>
                      </div>
                      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <Avatar className="w-20 h-20 border-2 border-border">
                          <AvatarImage src={mediaUrl(profileForm.avatarUrl)} />
                          <AvatarFallback className="text-xl font-serif bg-primary/10 text-primary">{profileForm.displayName.substring(0, 2).toUpperCase() || 'QH'}</AvatarFallback>
                        </Avatar>
                        <button onClick={() => avatarInputRef.current?.click()} className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md hover:bg-primary/90">
                          {isUploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                        </button>
                        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      </div>
                      <div className="flex-1">
                        <Label className="mb-1.5 block">{t('settings.avatar')}</Label>
                        <p className="text-xs text-muted-foreground mt-1">{t('settings.avatarLimits')}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Basic info */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('settings.basicInformation')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><Label>{t('settings.displayNameLabel')}</Label><Input value={profileForm.displayName} onChange={e => setProfileForm(f => ({ ...f, displayName: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.displayNamePlaceholder')} /></div>
                      <div>
                        <Label>{t('settings.headlineLabel')}</Label>
                        <Input value={profileForm.headline} onChange={e => setProfileForm(f => ({ ...f, headline: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.headlinePlaceholder')} />
                        <p className="text-xs text-muted-foreground mt-1">{t('settings.headlineHint')}</p>
                      </div>
                    </div>
                    <div><Label>{t('settings.bio')}</Label><Textarea value={profileForm.bio} onChange={e => setProfileForm(f => ({ ...f, bio: e.target.value }))} className="mt-1.5 rounded-xl resize-none" rows={3} placeholder={t('settings.bioPlaceholder')} /></div>
                    <div>
                      <Label>Professional identity</Label>
                      <Select value={profileForm.identityType || 'none'} onValueChange={value => setProfileForm(f => ({ ...f, identityType: value === 'none' ? null : value }))}>
                        <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder="Choose how you want to be discovered" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not specified</SelectItem>
                          {['reader', 'writer', 'artist', 'professional', 'student', 'builder', 'community'].map((identity) => <SelectItem key={identity} value={identity}>{identity.charAt(0).toUpperCase() + identity.slice(1)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">This appears on your profile and helps people understand your work.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><Label>{t('settings.locationLabel')}</Label><Input value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f, location: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.locationPlaceholder')} /></div>
                      <div>
                        <Label>{t('settings.countryLabel')}</Label>
                        <Select value={profileForm.country || 'none'} onValueChange={v => setProfileForm(f => ({ ...f, country: v === 'none' ? '' : v }))}>
                          <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder={t('settings.selectCountry')} /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            <SelectItem value="none">{t('settings.countryNotSpecified')}</SelectItem>
                            {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>{t('settings.websiteLabel')}</Label><Input value={profileForm.website} onChange={e => setProfileForm(f => ({ ...f, website: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.websitePlaceholder')} /></div>
                  </div>

                  <Separator />

                  {/* Social links */}
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('settings.socialLinks')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { icon: Facebook, key: 'facebook', placeholder: 'Facebook profile URL', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
                        { icon: Linkedin, key: 'linkedin', placeholder: 'LinkedIn profile URL', color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
                        { icon: Twitter, key: 'twitter', placeholder: 'Twitter/X profile URL', color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700' },
                        { icon: Instagram, key: 'instagram', placeholder: 'Instagram profile URL', color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800' },
                      ].map(({ icon: Icon, key, placeholder, color, bg }) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
                          <Input value={(profileForm as any)[key]} onChange={e => setProfileForm(f => ({ ...f, [key]: e.target.value }))} className="rounded-xl" placeholder={placeholder} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Visibility */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">{t('settings.visibilityPrivacySection')}</h3>
                    <div>
                      <Label>{t('settings.profileVisibilityLabel')}</Label>
                      <Select value={profileForm.profileVisibility} onValueChange={v => setProfileForm(f => ({ ...f, profileVisibility: v }))}>
                        <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">{t('settings.publicProfileOption')}</SelectItem>
                          <SelectItem value="followers">{t('settings.followersOnlyOption')}</SelectItem>
                          <SelectItem value="private">{t('settings.privateProfileOption')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-xl border border-border/40 space-y-3">
                      <p className="text-sm font-medium">{t('settings.contactInfoVisibility')}</p>
                      {[
                        { key: 'showEmail', label: t('settings.showEmailAddress'), desc: t('settings.showEmailAddressDesc') },
                        { key: 'showWebsite', label: t('settings.showWebsiteLink'), desc: t('settings.showWebsiteLinkDesc') },
                        { key: 'showLocation', label: t('settings.showLocationCountry'), desc: t('settings.showLocationCountryDesc') },
                      ].map(item => (
                        <div key={item.key} className="flex items-center justify-between">
                          <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                          <Switch checked={(profileForm as any)[item.key]} onCheckedChange={v => setProfileForm(f => ({ ...f, [item.key]: v }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button onClick={() => updateProfile({ data: profileForm as any })} disabled={isSaving} className="rounded-xl">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} {t('settings.saveProfile')}
                  </Button>
                </div>
              )}

              {/* ACCOUNT SECTION */}
              {activeSection === 'account' && (
                <div className="space-y-6">
                  <div><h2 className="text-xl font-semibold mb-1">{t('settings.accountSectionTitle')}</h2><p className="text-sm text-muted-foreground">{t('settings.accountSectionDesc')}</p></div>
                  <Separator />
                  <div className="space-y-4">
                    <div><Label>{t('settings.username')}</Label><Input value={profileForm.username} onChange={e => setProfileForm(f => ({ ...f, username: e.target.value }))} className="mt-1.5 rounded-xl" /><p className="text-xs text-muted-foreground mt-1.5">Use 3–32 letters, numbers, or underscores.</p></div>
                    <div><Label>{t('settings.displayNameLabel', 'Display Name')}</Label><Input value={profileForm.displayName} onChange={e => setProfileForm(f => ({ ...f, displayName: e.target.value }))} className="mt-1.5 rounded-xl" /></div>
                    <Button onClick={handleSaveAccountInfo} disabled={isSavingAccountInfo} className="rounded-xl">
                      {isSavingAccountInfo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save changes
                    </Button>
                    <div><Label>{t('settings.email')}</Label><Input defaultValue={user?.email} className="mt-1.5 rounded-xl" /></div>
                    <Separator />
                    <div>
                      <h3 className="font-medium mb-4">{t('settings.changePassword')}</h3>
                      <div className="space-y-3">
                        <div><Label>{t('settings.currentPassword')}</Label><Input type="password" className="mt-1.5 rounded-xl" /></div>
                        <div><Label>{t('settings.newPassword')}</Label><Input type="password" className="mt-1.5 rounded-xl" /></div>
                        <div><Label>{t('settings.confirmNewPassword')}</Label><Input type="password" className="mt-1.5 rounded-xl" /></div>
                      </div>
                    </div>
                    <Button className="rounded-xl" onClick={() => toast({ title: t('settings.comingSoon'), description: t('settings.passwordChangeNotImplemented') })}><Save className="w-4 h-4 mr-2" /> {t('settings.updateAccount')}</Button>
                  </div>
                </div>
              )}

              {/* SECURITY / 2FA SECTION */}
              {activeSection === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.securitySectionTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.securitySectionDesc')}</p>
                  </div>
                  <Separator />

                  <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Smartphone className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">{t('settings.authenticatorApp')}</h3>
                          <p className="text-sm text-muted-foreground">
                            {twofaStatus?.enabled ? t('settings.authenticatorEnabled') : t('settings.authenticatorSuggestion')}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${twofaStatus?.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        {twofaStatus?.enabled ? t('settings.enabled') : t('settings.disabled')}
                      </span>
                    </div>

                    {!twofaStatus?.enabled && !twofaSecret && (
                      <Button onClick={setup2fa} disabled={twofaBusy} className="rounded-xl">
                        {twofaBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                        {t('settings.setup2fa')}
                      </Button>
                    )}

                    {!twofaStatus?.enabled && twofaSecret && (
                      <div className="space-y-3 border-t border-border/40 pt-4">
                        <div>
                          <Label className="text-xs">{t('settings.scanSecret')}</Label>
                          <Input readOnly value={twofaSecret} className="mt-1.5 rounded-xl font-mono text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs">{t('settings.enterCodeFromApp')}</Label>
                          <Input
                            value={twofaCode}
                            onChange={e => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            maxLength={6}
                            className="mt-1.5 rounded-xl tracking-widest text-center font-mono"
                            placeholder="123456"
                          />
                        </div>
                        <Button onClick={enable2fa} disabled={twofaBusy} className="rounded-xl">
                          {twofaBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t('settings.verifyEnable')}
                        </Button>
                      </div>
                    )}

                    {twofaStatus?.enabled && (
                      <div className="space-y-3 border-t border-border/40 pt-4">
                        <div>
                          <Label className="text-xs">{t('settings.disableCodePrompt')}</Label>
                          <Input
                            value={twofaCode}
                            onChange={e => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            maxLength={6}
                            className="mt-1.5 rounded-xl tracking-widest text-center font-mono"
                            placeholder="123456"
                          />
                        </div>
                        <Button variant="destructive" onClick={disable2fa} disabled={twofaBusy} className="rounded-xl">
                          {twofaBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t('settings.disable2fa')}
                        </Button>
                      </div>
                    )}
                  </div>

                  <SessionsCard token={token} toast={toast} />

                  <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <KeyRound className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">{t('settings.passkeys')}</h3>
                          <p className="text-sm text-muted-foreground">{t('settings.passkeysDesc')}</p>
                        </div>
                      </div>
                      <Button onClick={addPasskey} disabled={passkeyAdding} size="sm" className="rounded-xl gap-1.5">
                        {passkeyAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {t('settings.addPasskey')}
                      </Button>
                    </div>
                    {passkeysLoading ? (
                      <div className="text-xs text-muted-foreground">{t('settings.passkeysLoading')}</div>
                    ) : passkeys.length === 0 ? (
                      <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">{t('settings.noPasskeys')}</p>
                    ) : (
                      <div className="space-y-2 border-t border-border/40 pt-3">
                        {passkeys.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <div>
                              <p className="font-medium">{p.deviceName || `Passkey #${p.id}`}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {t('settings.added')} {new Date(p.createdAt).toLocaleDateString()}{p.lastUsedAt ? ` · ${t('settings.lastUsed')} ${new Date(p.lastUsedAt).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => removePasskey(p.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive" data-testid={`btn-remove-passkey-${p.id}`}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PRIVACY SECTION */}
              {activeSection === 'privacy' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.privacySectionTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.privacySectionDesc')}</p>
                  </div>
                  <Separator />
                  <div className="space-y-5">
                    {([
                      { key: 'publicProfile' as const, icon: Globe, label: t('settings.publicProfile'), desc: t('settings.publicProfileDesc') },
                      { key: 'showPostsToEveryone' as const, icon: Eye, label: t('settings.showPostsToEveryone'), desc: t('settings.showPostsToEveryoneDesc') },
                      { key: 'allowMessagesFromAnyone' as const, icon: MessageCircle, label: t('settings.allowMessagesFromAnyone'), desc: t('settings.allowMessagesFromAnyoneDesc') },
                      { key: 'showInSearch' as const, icon: User, label: t('settings.showInSearchResults'), desc: t('settings.showInSearchResultsDesc') },
                    ]).map(item => {
                      const checked = item.key === 'publicProfile'
                        ? privacy.profileVisibility === 'public'
                        : privacy[item.key];
                      const onCheckedChange = (v: boolean) => {
                        if (item.key === 'publicProfile') updatePrivacy('profileVisibility', v ? 'public' : 'private');
                        else updatePrivacy(item.key, v);
                      };
                      const saving = privacySaving === (item.key === 'publicProfile' ? 'profileVisibility' : item.key);
                      return (
                        <div key={item.label} className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                              <item.icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                            <Switch checked={Boolean(checked)} onCheckedChange={onCheckedChange} data-testid={`switch-privacy-${item.key}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Separator />
                  <div>
                    <h3 className="text-base font-semibold mb-1">{t('settings.yourData')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('settings.downloadQuillhiveData')}
                    </p>
                    <Button
                      variant="outline"
                      className="rounded-xl gap-2"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/auth/me/export', {
                            headers: token ? { Authorization: `Bearer ${token}` } : {},
                          });
                          if (!res.ok) throw new Error(`Export failed (${res.status})`);
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          const stamp = new Date().toISOString().slice(0, 10);
                          a.download = `quillhive-data-${stamp}.json`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                          toast({ title: t('settings.dataExportReady'), description: t('settings.downloadStarted') });
                        } catch (e: any) {
                          toast({ title: t('settings.couldNotExportData'), description: e?.message || t('settings.tryAgainLater'), variant: 'destructive' });
                        }
                      }}
                      data-testid="btn-export-data"
                    >
                      <Download className="w-4 h-4" />
                      {t('settings.downloadMyData')}
                    </Button>
                  </div>
                </div>
              )}

              {/* WORK EXPERIENCE */}
              {activeSection === 'experience' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div><h2 className="text-xl font-semibold mb-1">{t('settings.workExperience')}</h2><p className="text-sm text-muted-foreground">{t('settings.workExperienceDesc')}</p></div>
                    <Button size="sm" onClick={openAddWork} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> {t('settings.add')}</Button>
                  </div>
                  <Separator />
                  {isLoadingWork ? (
                    <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
                  ) : workHistory.length === 0 ? (
                    <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed border-border">
                      <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                      <p className="text-muted-foreground font-medium">{t('settings.noWorkExperienceYet')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('settings.addWorkExperienceHint')}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {workHistory.map(entry => (
                        <div key={entry.id} className="flex gap-4 p-4 bg-muted/20 rounded-xl border border-border/50 group">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5"><Briefcase className="w-5 h-5" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">{entry.title}</p>
                                <p className="text-sm text-primary font-medium">{entry.organization}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{entry.startYear} - {entry.endYear || t('settings.present')}</p>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="ghost" onClick={() => openEditWork(entry)} className="h-7 w-7 p-0 rounded-lg"><Pencil className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteWork(entry.id)} className="h-7 w-7 p-0 rounded-lg text-destructive hover:text-destructive"><X className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                            {entry.description && <p className="text-sm text-muted-foreground mt-2">{entry.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* EDUCATION */}
              {activeSection === 'education' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div><h2 className="text-xl font-semibold mb-1">{t('settings.educationSection')}</h2><p className="text-sm text-muted-foreground">{t('settings.educationSectionDesc')}</p></div>
                    <Button size="sm" onClick={openAddEdu} className="rounded-xl gap-2"><Plus className="w-4 h-4" /> {t('settings.add')}</Button>
                  </div>
                  <Separator />
                  {isLoadingEdu ? (
                    <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
                  ) : educationHistory.length === 0 ? (
                    <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed border-border">
                      <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                      <p className="text-muted-foreground font-medium">{t('settings.noEducationAddedYet')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('settings.addEducationHint')}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {educationHistory.map(entry => (
                        <div key={entry.id} className="flex gap-4 p-4 bg-muted/20 rounded-xl border border-border/50 group">
                          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/30 text-violet-600 flex items-center justify-center shrink-0 mt-0.5"><GraduationCap className="w-5 h-5" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">{entry.school}</p>
                                <p className="text-sm text-primary font-medium">{entry.degree}{entry.field ? ` · ${entry.field}` : ''}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{entry.startYear} - {entry.endYear || t('settings.present')}</p>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="ghost" onClick={() => openEditEdu(entry)} className="h-7 w-7 p-0 rounded-lg"><Pencil className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteEdu(entry.id)} className="h-7 w-7 p-0 rounded-lg text-destructive hover:text-destructive"><X className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                            {entry.description && <p className="text-sm text-muted-foreground mt-2">{entry.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* NOTIFICATIONS SECTION */}
              {activeSection === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.notificationsSection')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.notificationsSectionDesc')}</p>
                  </div>
                  <Separator />
                  {isLoadingNotifPrefs && (
                    <div className="flex items-center gap-2 text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading preferences…</div>
                  )}
                  {!isLoadingNotifPrefs && notifPrefs && (() => {
                    const GROUPS: Array<{ label: string; types: Array<{ key: string; label: string }> }> = [
                      { label: 'Social', types: [
                        { key: 'like', label: 'Likes on your posts' },
                        { key: 'comment', label: 'Comments on your posts' },
                        { key: 'reply', label: 'Replies to your comments' },
                        { key: 'comment_like', label: 'Likes on your comments' },
                        { key: 'follow', label: 'New followers' },
                        { key: 'mention', label: 'Mentions' },
                        { key: 'appreciation', label: 'Appreciations' },
                        { key: 'share', label: 'Shares of your posts' },
                      ]},
                      { label: 'Content & Discovery', types: [
                        { key: 'highlight', label: 'Post highlighted' },
                        { key: 'poll_vote', label: 'Poll votes' },
                        { key: 'trending', label: 'Your post is trending' },
                      ]},
                      { label: 'Community', types: [
                        { key: 'group_invite', label: 'Group invitations' },
                      ]},
                      { label: 'Library', types: [
                        { key: 'library_save', label: 'Someone saved your entry' },
                        { key: 'library_feature', label: 'Entry featured by admin' },
                        { key: 'library_entry', label: 'New library entries in your topics' },
                      ]},
                      { label: 'Opportunities', types: [
                        { key: 'commission_request', label: 'Commission requests' },
                        { key: 'commission_response', label: 'Commission responses' },
                        { key: 'collaboration_accepted', label: 'Collaboration accepted' },
                        { key: 'collaboration_declined', label: 'Collaboration declined' },
                        { key: 'skill_endorsement', label: 'Skill endorsements' },
                      ]},
                      { label: 'Growth & Milestones', types: [
                        { key: 'milestone', label: 'Milestone reached' },
                        { key: 'achievement', label: 'Achievement unlocked' },
                        { key: 'streak_milestone', label: 'Writing streak milestone' },
                        { key: 'referral_reward', label: 'Referral rewards' },
                        { key: 'opportunity_nudge', label: 'Opportunity nudges' },
                      ]},
                      { label: 'System', types: [
                        { key: 'system', label: 'System notifications' },
                        { key: 'admin_action', label: 'Admin actions on your account' },
                        { key: 'post_approved', label: 'Post approved' },
                        { key: 'post_rejected', label: 'Post rejected' },
                      ]},
                    ];
                    return (
                      <div className="space-y-6">
                        {GROUPS.map(group => (
                          <div key={group.label}>
                            <div className="grid grid-cols-[1fr_68px_68px_68px] gap-x-2 items-center px-1 mb-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h4>
                              <span className="text-[10px] text-center text-muted-foreground">In-app</span>
                              <span className="text-[10px] text-center text-muted-foreground">Push</span>
                              <span className="text-[10px] text-center text-muted-foreground">Email</span>
                            </div>
                            <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
                              {group.types.map(item => {
                                const p = notifPrefs[item.key] ?? { inApp: true, push: false, email: false };
                                return (
                                  <div key={item.key} className="grid grid-cols-[1fr_68px_68px_68px] gap-x-2 items-center px-4 py-3 hover:bg-muted/30 transition-colors">
                                    <span className="text-sm">{item.label}</span>
                                    <div className="flex justify-center"><Switch checked={p.inApp} onCheckedChange={v => patchNotifPref(item.key, 'inApp', v)} /></div>
                                    <div className="flex justify-center"><Switch checked={p.push} onCheckedChange={v => patchNotifPref(item.key, 'push', v)} /></div>
                                    <div className="flex justify-center"><Switch checked={p.email} onCheckedChange={v => patchNotifPref(item.key, 'email', v)} /></div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <Separator />
                  <div>
                    <h3 className="font-medium mb-1">{t('settings.creatorNotifications')}</h3>
                    <p className="text-xs text-muted-foreground mb-4">{t('settings.creatorNotificationsDesc')}</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between py-4 border-b border-border/40">
                        <div>
                          <p className="font-medium text-sm">{t('settings.weeklyEmailDigest')}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.weeklyEmailDigestDesc')}</p>
                        </div>
                        <Switch
                          checked={creatorSettings.emailDigestEnabled}
                          onCheckedChange={(checked) => setCreatorSettings(s => ({ ...s, emailDigestEnabled: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between py-4 border-b border-border/40">
                        <div>
                          <p className="font-medium text-sm">{t('settings.topicPostNotifications')}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.topicPostNotificationsDesc')}</p>
                        </div>
                        <Switch
                          checked={creatorSettings.topicNotificationEnabled}
                          onCheckedChange={(checked) => setCreatorSettings(s => ({ ...s, topicNotificationEnabled: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between py-4">
                        <div>
                          <p className="font-medium text-sm">{t('settings.hireMeButton')}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.hireMeButtonDesc')}</p>
                        </div>
                        <Switch
                          checked={creatorSettings.hireMeEnabled}
                          onCheckedChange={(checked) => setCreatorSettings(s => ({ ...s, hireMeEnabled: checked }))}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    className="rounded-xl"
                    disabled={isSavingCreatorSettings}
                    onClick={async () => {
                      setIsSavingCreatorSettings(true);
                      try {
                        const res = await fetch('/api/users/me/settings', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                          body: JSON.stringify(creatorSettings),
                        });
                        if (res.ok) {
                          const updated = await res.json();
                          setUser(updated as any);
                          toast({ title: t('settings.preferencesSaved') });
                        } else {
                          toast({ title: t('settings.errSavingPreferences'), variant: 'destructive' });
                        }
                      } catch {
                        toast({ title: t('settings.errSavingPreferences'), variant: 'destructive' });
                      } finally {
                        setIsSavingCreatorSettings(false);
                      }
                    }}
                  >
                    {isSavingCreatorSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {t('settings.savePreferences')}
                  </Button>
                </div>
              )}

              {/* APPEARANCE SECTION */}
              {activeSection === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.appearanceSectionTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.appearanceSectionDesc')}</p>
                  </div>
                  <Separator />
                  <CreatorModeToggle />
                  <Separator />
                  <div>
                    <h3 className="font-medium mb-4">{t('settings.themeSection')}</h3>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <button
                        onClick={() => theme === 'dark' && toggleTheme()}
                        className={`rounded-2xl border-2 p-4 flex flex-col items-center gap-3 transition-all ${theme === 'light' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                      >
                        <div className="w-full h-16 bg-white rounded-xl border border-gray-200 flex items-center justify-center">
                          <Sun className="w-6 h-6 text-amber-500" />
                        </div>
                        <span className="font-medium text-sm">{t('settings.light')}</span>
                      </button>
                      <button
                        onClick={() => theme === 'light' && toggleTheme()}
                        className={`rounded-2xl border-2 p-4 flex flex-col items-center gap-3 transition-all ${theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                      >
                        <div className="w-full h-16 bg-gray-900 rounded-xl border border-gray-700 flex items-center justify-center">
                          <Moon className="w-6 h-6 text-violet-400" />
                        </div>
                        <span className="font-medium text-sm">{t('settings.dark')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CONNECTED APPS SECTION */}
              {activeSection === 'connectedApps' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.connectedApps', 'Connected Apps')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.connectedAppsDesc', 'OAuth connections for signing in to QuillHive.')}</p>
                  </div>
                  <Separator />
                  <div className="rounded-2xl border border-border/60 bg-card p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Link2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">OAuth sign-in</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Google and GitHub sign-in are available from the QuillHive login page.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'language' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.language')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.languageDesc', 'Choose the language QuillHive uses for your account')}</p>
                  </div>
                  <Separator />
                  <div className="max-w-sm space-y-3">
                    <Label>{t('settings.preferredLanguage', 'Preferred language')}</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="rounded-xl h-12" aria-label={t('settings.preferredLanguage', 'Preferred language')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LANGS.map(l => (
                          <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('settings.languageHint', 'Arabic enables right-to-left layout support. Changes apply immediately after saving.')}</p>
                  </div>
                  <Button className="rounded-xl" onClick={async () => {
                    try {
                      setLang(language, true);
                      const res = await fetch('/api/user/language', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ lang: language }),
                      });
                      if (!res.ok) throw new Error();
                      const updated = await res.json();
                      setUser(updated as any);
                      toast({ title: t('settings.languageSaved', 'Language saved'), description: t('settings.languageSavedDesc', 'Your preference is synced and UI updated.') });
                    } catch {
                      toast({ title: t('settings.savedLocally', 'Saved locally'), description: t('settings.savedLocallyDesc', 'Language changed. We could not sync with the server right now.') });
                    }
                  }}>
                    <Save className="w-4 h-4 mr-2" /> {t('settings.saveLanguage', 'Save Language')}
                  </Button>
                </div>
              )}

              {/* INVITE FRIENDS */}
              {activeSection === 'invites' && <InvitesSection />}

              {/* STRIKES & WARNINGS */}
              {activeSection === 'warnings' && <WarningsSection />}

              {/* BLOCKED USERS SECTION */}
              {activeSection === 'blocked' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.blockedUsers')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.blockedUsersDesc')}</p>
                  </div>
                  <Separator />
                  <div className="py-12 text-center text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('settings.youHaventBlockedAnyone')}</p>
                  </div>
                </div>
              )}

              {/* BILLING & BOOSTS */}
              {activeSection === 'billing' && <BillingSection />}

              {/* API KEYS */}
              {activeSection === 'apiKeys' && user?.role === 'super_admin' && <ApiKeysSection />}

              {/* DANGER ZONE */}
              {activeSection === 'danger' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('settings.yourDataTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('settings.deleteAccountDesc')}</p>
                  </div>
                  <Separator />

                  <div className="rounded-2xl border border-border/60 bg-card p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Download className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{t('settings.downloadYourData')}</h3>
                        <p className="text-sm text-muted-foreground">{t('settings.downloadQuillhiveData')}</p>
                      </div>
                    </div>
                    <Button onClick={handleExportData} disabled={isExporting} variant="outline" className="rounded-xl">
                      {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      {t('settings.exportMyData')}
                    </Button>
                  </div>

                  <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-destructive">{t('settings.deleteAccount')}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.deleteAccountWarning')}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">{t('settings.typeDeleteToConfirm')}</Label>
                      <Input
                        value={deleteConfirmText}
                        onChange={e => setDeleteConfirmText(e.target.value)}
                        className="mt-1.5 rounded-xl"
                        placeholder="DELETE"
                      />
                    </div>
                    <Button
                      variant="destructive"
                      disabled={isDeletingAccount || deleteConfirmText !== 'DELETE'}
                      className="rounded-xl"
                      onClick={handleDeleteAccount}
                    >
                      {isDeletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      {t('settings.permanentlyDeleteAccount')}
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
      {/* Work Experience Dialog */}
      <Dialog open={workDialog.open} onOpenChange={o => setWorkDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader><DialogTitle className="font-serif text-xl flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary" />{workDialog.editing ? t('settings.editWorkExperience') : t('settings.addWorkExperience')}</DialogTitle></DialogHeader>
          <div className="py-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t('settings.jobTitle')} *</Label><Input value={workForm.title} onChange={e => setWorkForm(f => ({ ...f, title: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.seniorWriterPlaceholder')} /></div>
              <div><Label>{t('settings.organizationLabel')} *</Label><Input value={workForm.organization} onChange={e => setWorkForm(f => ({ ...f, organization: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.newYorkerPlaceholder')} /></div>
              <div><Label>{t('settings.startYear')} *</Label><Input type="number" value={workForm.startYear} onChange={e => setWorkForm(f => ({ ...f, startYear: Number(e.target.value) }))} className="mt-1.5 rounded-xl" min={1900} max={2100} /></div>
              <div><Label>{t('settings.endYear')} <span className="text-muted-foreground text-xs">{t('settings.endYearHint')}</span></Label><Input type="number" value={workForm.endYear} onChange={e => setWorkForm(f => ({ ...f, endYear: e.target.value }))} className="mt-1.5 rounded-xl" min={1900} max={2100} placeholder={t('settings.endYearPlaceholder')} /></div>
            </div>
            <div><Label>{t('settings.descriptionLabel')} <span className="text-muted-foreground text-xs">{t('settings.optional')}</span></Label><Textarea value={workForm.description} onChange={e => setWorkForm(f => ({ ...f, description: e.target.value }))} className="mt-1.5 rounded-xl resize-none" rows={3} placeholder={t('settings.describeRolePlaceholder')} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWorkDialog(p => ({ ...p, open: false }))} className="rounded-xl">{t('settings.cancel')}</Button>
            <Button onClick={handleSaveWork} disabled={isSavingWork} className="rounded-xl">
              {isSavingWork ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} {t('settings.saveBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Education Dialog */}
      <Dialog open={eduDialog.open} onOpenChange={o => setEduDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader><DialogTitle className="font-serif text-xl flex items-center gap-2"><GraduationCap className="w-5 h-5 text-violet-600" />{eduDialog.editing ? t('settings.editEducation') : t('settings.addEducation')}</DialogTitle></DialogHeader>
          <div className="py-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t('settings.schoolLabel')} *</Label><Input value={eduForm.school} onChange={e => setEduForm(f => ({ ...f, school: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.columbiaPlaceholder')} /></div>
              <div><Label>{t('settings.degreeLabel')} *</Label><Input value={eduForm.degree} onChange={e => setEduForm(f => ({ ...f, degree: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.bachelorPlaceholder')} /></div>
              <div><Label>{t('settings.fieldOfStudy')} <span className="text-muted-foreground text-xs">{t('settings.optional')}</span></Label><Input value={eduForm.field} onChange={e => setEduForm(f => ({ ...f, field: e.target.value }))} className="mt-1.5 rounded-xl" placeholder={t('settings.creativeWritingPlaceholder')} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t('settings.startYear')} *</Label><Input type="number" value={eduForm.startYear} onChange={e => setEduForm(f => ({ ...f, startYear: Number(e.target.value) }))} className="mt-1.5 rounded-xl" min={1900} max={2100} /></div>
                <div><Label>{t('settings.endYear')}</Label><Input type="number" value={eduForm.endYear} onChange={e => setEduForm(f => ({ ...f, endYear: e.target.value }))} className="mt-1.5 rounded-xl" min={1900} max={2100} placeholder={t('settings.endYearNowPlaceholder')} /></div>
              </div>
            </div>
            <div><Label>{t('settings.descriptionLabel')} <span className="text-muted-foreground text-xs">{t('settings.optional')}</span></Label><Textarea value={eduForm.description} onChange={e => setEduForm(f => ({ ...f, description: e.target.value }))} className="mt-1.5 rounded-xl resize-none" rows={3} placeholder={t('settings.honorsPlaceholder')} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEduDialog(p => ({ ...p, open: false }))} className="rounded-xl">{t('settings.cancel')}</Button>
            <Button onClick={handleSaveEdu} disabled={isSavingEdu} className="rounded-xl">
              {isSavingEdu ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} {t('settings.saveBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

interface StrikeRecord {
  id: number;
  reason: string;
  severity: number;
  createdAt: string;
  acknowledgedAt: string | null;
}

function WarningsSection() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const t = useT();
  const [strikes, setStrikes] = useState<StrikeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/strikes/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const json = await res.json() as { strikes: StrikeRecord[] };
        setStrikes(Array.isArray(json?.strikes) ? json.strikes : []);
      } catch {
        toast({ title: 'Could not load warnings', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [token, toast]);

  const acknowledge = async (id: number) => {
    if (!token) return;
    try {
      await fetch(`/api/strikes/${id}/acknowledge`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setStrikes(prev => prev.map(s => s.id === id ? { ...s, acknowledgedAt: new Date().toISOString() } : s));
    } catch {
      toast({ title: t('settings.failedToAcknowledge'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6" data-testid="section-warnings">
      <div>
        <h2 className="text-xl font-semibold mb-1">{t('strikes.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('strikes.issuedBy')}</p>
      </div>
      <Separator />
      {loading ? (
        <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : strikes.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('strikes.noWarnings')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {strikes.map(s => {
            const sevLabel = s.severity >= 3
              ? t('strikes.finalWarning')
              : s.severity === 2
                ? t('strikes.strike')
                : t('strikes.warning');
            return (
              <div key={s.id} className="border border-border rounded-2xl p-4 flex items-start gap-3" data-testid={`strike-row-${s.id}`}>
                <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${s.acknowledgedAt ? 'text-muted-foreground' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{sevLabel}</span>
                    <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</span>
                    {s.acknowledgedAt && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{t('strikes.acknowledged')}</span>}
                  </div>
                  <p className="text-sm mt-1 break-words">{s.reason}</p>
                </div>
                {!s.acknowledgedAt && (
                  <Button size="sm" variant="outline" onClick={() => acknowledge(s.id)} data-testid={`button-ack-${s.id}`}>
                    {t('strikes.acknowledge')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface InviteRow { id: number; code: string; usedBy: number | null; usedAt: string | null; expiresAt: string | null; isActive: boolean; createdAt: string; }
function InvitesSection() {
  const { toast } = useToast();
  const t = useT();
  const token = getStoredToken();
  const [codes, setCodes] = useState<InviteRow[]>([]);
  const [totalInvited, setTotalInvited] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/invites/mine', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      setCodes(Array.isArray(data?.codes) ? data.codes : []);
      setTotalInvited(Number(data?.totalInvited) || 0);
    } catch { setCodes([]); setTotalInvited(0); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/invites/generate', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('settings.couldNotExportData'));
      toast({ title: t('settings.inviteCreated'), description: data?.shareUrl ?? '' });
      await load();
    } catch (err: any) {
      toast({ title: err?.message || t('settings.uploadFailed'), variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/signup?invite=${encodeURIComponent(code)}`;
    try { await navigator.clipboard.writeText(url); toast({ title: t('settings.inviteLinkCopied') }); }
    catch { toast({ title: t('settings.copyFailed'), variant: 'destructive' }); }
  };

  const active = codes.filter(c => !c.usedBy && c.isActive);
  const used = codes.filter(c => c.usedBy);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">{t('settings.inviteFriends')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.inviteFriendsDesc')}</p>
      </div>
      <Separator />

      {/* Referral progress tracker */}
      {totalInvited > 0 && (() => {
        const milestones = [
          { count: 1, label: '1 friend', reward: 'Profile badge' },
          { count: 3, label: '3 friends', reward: '1 month Pro trial' },
          { count: 5, label: '5 friends', reward: 'Boost credit' },
          { count: 10, label: '10 friends', reward: 'Full Pro access' },
        ];
        const nextMilestone = milestones.find(m => totalInvited < m.count);
        const lastMilestone = [...milestones].reverse().find(m => totalInvited >= m.count);
        return (
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">{t('settings.referralRewards')}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {t('settings.youReferred')} <strong>{totalInvited}</strong> {totalInvited === 1 ? t('settings.person') : t('settings.people')}.
              {lastMilestone && <span className="text-primary"> {t('settings.youUnlocked')}: {lastMilestone.reward}!</span>}
            </p>
            {nextMilestone && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{t('settings.nextReward')}: <strong>{nextMilestone.reward}</strong> at {nextMilestone.label}</span>
                  <span>{totalInvited}/{nextMilestone.count}</span>
                </div>
                <div className="w-full bg-border rounded-full h-2">
                  <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min((totalInvited / nextMilestone.count) * 100, 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{active.length} {active.length === 1 ? t('settings.activeCodes') : t('settings.activeCodesPlural')}</p>
          <p className="text-xs text-muted-foreground">{used.length} {t('settings.redeemedTotal')}</p>
        </div>
        <Button onClick={() => void generate()} disabled={generating || active.length >= 10}>
          <Plus className="w-4 h-4 mr-2" /> {generating ? t('settings.generating') : t('settings.generateInvite')}
        </Button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : codes.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <p className="text-sm">{t('settings.noInvitesYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 border border-border rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm tracking-wider">{c.code}</p>
                <p className="text-xs text-muted-foreground">
                  {c.usedBy ? `${t('settings.redeemed')} ${c.usedAt ? new Date(c.usedAt).toLocaleDateString() : ''}` :
                    c.expiresAt ? `${t('settings.expires')} ${new Date(c.expiresAt).toLocaleDateString()}` : t('settings.activeStatus')}
                </p>
              </div>
              {!c.usedBy && c.isActive && (
                <Button size="sm" variant="outline" onClick={() => void copyLink(c.code)}>{t('settings.copyLink')}</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[] | string | null;
  rateLimitPerMinute: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface BoostHistoryRow {
  id: number;
  status: string;
  plan: string;
  postId: number | null;
  postTitle: string | null;
  boostEndsAt: string | null;
  createdAt: string;
  adminNote: string | null;
}

const PLAN_LABELS: Record<string, { label: string; amount: string }> = {
  starter:   { label: 'Starter Boost',  amount: '$5' },
  growth:    { label: 'Growth Boost',   amount: '$15' },
  spotlight: { label: 'Spotlight',      amount: '$30' },
};

function BoostStatusBadge({ status }: { status: string }) {
  if (status === 'active')
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Active</span>;
  if (status === 'pending' || status === 'pending_payment')
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Pending</span>;
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Declined</span>;
  if (status === 'completed')
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Completed</span>;
  return <span className="text-xs text-muted-foreground capitalize">{status}</span>;
}

function BillingSection() {
  const token = getStoredToken();
  const [boosts, setBoosts] = useState<BoostHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/boost/my', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then(d => setBoosts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const activeCount = boosts.filter(b => b.status === 'active').length;
  const totalSpent = boosts
    .filter(b => b.status === 'active' || b.status === 'completed')
    .reduce((sum, b) => sum + (PLAN_LABELS[b.plan]?.amount ? parseInt(PLAN_LABELS[b.plan].amount.replace('$', ''), 10) : 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Billing &amp; Boosts</h2>
        <p className="text-sm text-muted-foreground">Your boost payment history via Flutterwave. Payments are processed securely.</p>
      </div>
      <Separator />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Boosts</p>
          <p className="text-2xl font-bold">{boosts.length}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Active Now</p>
          <p className="text-2xl font-bold text-emerald-500">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
          <p className="text-2xl font-bold">${totalSpent}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payment History</h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : boosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
            <Rocket className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No boosts yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Boost a post to amplify your reach.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {boosts.map(b => {
              const planInfo = PLAN_LABELS[b.plan] ?? { label: b.plan, amount: '-' };
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 border border-border/60 rounded-2xl px-4 py-3 bg-card">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{planInfo.label}</span>
                      <span className="text-xs font-semibold text-primary">{planInfo.amount}</span>
                      <BoostStatusBadge status={b.status} />
                    </div>
                    {b.postTitle && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">"{b.postTitle}"</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {b.boostEndsAt && b.status === 'active' && (
                        <> · ends {new Date(b.boostEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                      )}
                    </p>
                    {b.adminNote && b.status === 'rejected' && (
                      <p className="text-xs text-destructive mt-0.5">{b.adminNote}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">Payment provider</p>
        <p>All payments are processed by <strong>Flutterwave</strong>. QuillHive does not store your card details.</p>
        <p>For disputes or refunds, contact <a href="mailto:support@quillhive.app" className="underline hover:text-primary">support@quillhive.app</a>.</p>
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const { toast } = useToast();
  const t = useT();
  const token = getStoredToken();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/me/api-keys'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const data = await res.json();
      const list: ApiKeyRow[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.apiKeys) ? data.apiKeys : Array.isArray(data) ? data : [];
      setKeys(list);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [token]);

  const create = async () => {
    if (!newKeyName.trim()) {
      toast({ title: t('settings.nameRequired'), variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(apiUrl('/api/me/api-keys'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const raw = data?.data?.key || data?.key || data?.apiKey?.key || data?.rawKey;
      if (raw) setRevealedKey(raw);
      setNewKeyName('');
      await load();
      toast({ title: t('settings.apiKeyCreated') });
    } catch {
      toast({ title: t('settings.failedToCreateKey'), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm(t('settings.revokeKeyConfirm'))) return;
    try {
      const res = await fetch(apiUrl(`/api/me/api-keys/${id}`), {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      await load();
      toast({ title: t('settings.apiKeyRevoked') });
    } catch {
      toast({ title: t('settings.failedToRevokeKey'), variant: 'destructive' });
    }
  };

  const copyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      toast({ title: t('settings.inviteLinkCopied') });
    } catch {
      toast({ title: t('settings.couldNotCopy'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">{t('settings.apiKeys')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('settings.apiKeysDesc')}
        </p>
      </div>
      <Separator />

      {revealedKey && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3" data-testid="reveal-api-key">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {t('settings.copyThisKeyNow')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-background px-3 py-2 text-xs font-mono break-all">{revealedKey}</code>
            <Button size="sm" variant="outline" onClick={copyKey}>{t('settings.copy')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setRevealedKey(null)}>{t('settings.dismiss')}</Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <Label htmlFor="new-key-name">{t('settings.newKey')}</Label>
        <div className="flex gap-2">
          <Input
            id="new-key-name"
            placeholder={t('settings.newKeyPlaceholder')}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            data-testid="input-new-api-key-name"
          />
          <Button onClick={create} disabled={creating} data-testid="button-create-api-key">
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            {t('settings.generate')}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.noApiKeysYet')}</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-3 border border-border rounded-xl px-4 py-3"
              data-testid={`row-api-key-${k.id}`}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{k.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {k.keyPrefix}…
                  {k.lastUsedAt ? ` · ${t('settings.lastUsedPrefix')} ${new Date(k.lastUsedAt).toLocaleDateString()}` : ` · ${t('settings.neverUsed')}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => revoke(k.id)} data-testid={`button-revoke-key-${k.id}`}>
                <X className="w-4 h-4 mr-1" /> {t('settings.revoke')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
