/**
 * Type definitions for Rakshika AI Women's Safety & Guardian Ecosystem
 */

export type UserRole = 'user' | 'guardian';

export interface UserProfile {
  id: string;
  phone: string;
  fullName: string;
  email?: string;
  role: UserRole;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodGroup?: string;
  allergies?: string;
  medicalNotes?: string;
  isSharingLocation: boolean;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuardianRelationship {
  id: string;
  userPhone: string;
  userName: string;
  guardianPhone: string;
  guardianName: string;
  status: 'active' | 'revoked';
  authorizedAt: string;
  createdAt?: string;
}

export interface GuardianInvitation {
  id: string;
  userPhone: string;
  userName: string;
  inviteCode: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface LocationUpdate {
  id?: string;
  userPhone: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  isSharing: boolean;
  timestamp: number;
  createdAt?: string;
}

export type IncidentTriggerType = 'manual_sos' | 'voice_sos' | 'shake_fall' | 'flash_sos' | 'fake_call' | 'inactivity';
export type IncidentStatus = 'ACTIVE' | 'RESOLVED';

export interface GuardianAccessPermissions {
  camera: boolean;
  microphone: boolean;
  location: boolean;
  updatedAt?: string;
  updatedBy?: 'user' | 'guardian';
}

export interface GuardianAccessRequests {
  camera?: boolean;
  microphone?: boolean;
  location?: boolean;
  requestedAt?: string;
}

export interface EmergencyIncident {
  id: string;
  userPhone: string;
  userName: string;
  triggerType: IncidentTriggerType;
  latitude?: number | null;
  longitude?: number | null;
  status: IncidentStatus;
  notes?: string;
  createdAt: string;
  resolvedAt?: string | null;
}

export type SafetyEventType = 
  | 'distress_keyword'
  | 'shake_detected'
  | 'location_started'
  | 'location_stopped'
  | 'guardian_linked'
  | 'guardian_revoked'
  | 'sos_triggered'
  | 'sos_resolved'
  | 'check_in'
  | 'voice_clip_shared';

export type VoiceClipTag = 'sos' | 'suspicious' | 'checkin' | 'route_deviation' | 'general';

export interface VoiceClip {
  id: string;
  userPhone: string;
  userName: string;
  audioBase64: string; // Base64 data URL (e.g. data:audio/webm;base64,...)
  mimeType: string;
  durationSeconds: number;
  title: string;
  tag: VoiceClipTag;
  createdAt: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  listenedByGuardian?: boolean;
}

export interface SafetyEvent {
  id: string;
  userPhone: string;
  userName?: string;
  eventType: SafetyEventType;
  details: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface GuardianLinkedUserView {
  profile: UserProfile;
  latestLocation?: LocationUpdate | null;
  activeIncident?: EmergencyIncident | null;
  latestVoiceClip?: VoiceClip | null;
  voiceClips?: VoiceClip[];
  relationship: GuardianRelationship;
}
