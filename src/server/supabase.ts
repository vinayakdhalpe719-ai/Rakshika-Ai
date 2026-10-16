import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dns from "node:dns";
import { 
  UserProfile, 
  GuardianRelationship, 
  GuardianInvitation, 
  LocationUpdate, 
  EmergencyIncident, 
  SafetyEvent 
} from "../types/safety";

// Supabase configuration
const DEFAULT_SUPABASE_URL = "";
const DEFAULT_SUPABASE_KEY = "";

let supabaseClient: SupabaseClient | null = null;
let lastInitUrl = "";
let lastInitKey = "";
let hasLoggedConfigWarning = false;
let isSupabaseReachable = true;
let lastReachabilityCheck = 0;

/**
 * Checks whether an error is a low-level network failure (DNS, offline, timeout, fetch failed)
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  const msg = typeof error === "string" ? error : error.message || JSON.stringify(error);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("getaddrinfo") ||
    msg.includes("network error") ||
    msg.includes("NetworkError")
  );
}

export function markSupabaseUnreachable() {
  if (isSupabaseReachable) {
    isSupabaseReachable = false;
    lastReachabilityCheck = Date.now();
  }
}

/**
 * Normalizes Supabase URL to ensure it is in the standard format `https://<ref>.supabase.co`.
 */
export function normalizeSupabaseUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!url || url.includes("your-project-id")) return null;

  const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/i);
  if (dashboardMatch && dashboardMatch[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  url = url.replace(/\/+$/, "");

  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

export function isValidSupabaseKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (
    trimmed === "" ||
    trimmed.includes("your-supabase-anon-key") ||
    trimmed.includes("your-supabase-service-role-key") ||
    trimmed.length < 15
  ) {
    return false;
  }
  return true;
}

export function cleanSupabaseError(error: any): string {
  if (!error) return "Unknown Supabase error";
  const msg = typeof error === "string" ? error : error.message || JSON.stringify(error);
  if (isNetworkError(error)) {
    return "Database host unreachable (operating with high-speed local persistence).";
  }
  if (msg.includes("<!DOCTYPE") || msg.includes("<html") || msg.includes("404")) {
    return "Supabase endpoint returned 404 (check that SUPABASE_URL is 'https://<project-ref>.supabase.co').";
  }
  if (msg.includes("relation") && msg.includes("does not exist")) {
    return "Database table not found. Operating with local store.";
  }
  return msg;
}

// Proactive startup DNS validation
const startupUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
if (startupUrl) {
  try {
    const hostname = new URL(startupUrl).hostname;
    dns.lookup(hostname, (err) => {
      lastReachabilityCheck = Date.now();
      if (err) {
        isSupabaseReachable = false;
        console.log(`ℹ️ Supabase host '${hostname}' unreachable (${err.code}). Using local-first persistence.`);
      } else {
        isSupabaseReachable = true;
      }
    });
  } catch {
    isSupabaseReachable = false;
  }
}

export function getSupabase(): SupabaseClient | null {
  // Cooldown check for unreachable host (avoid repeated fetch failures)
  if (!isSupabaseReachable && Date.now() - lastReachabilityCheck < 60000) {
    return null;
  }

  const rawUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

  const normalizedUrl = normalizeSupabaseUrl(rawUrl);
  const validKey = isValidSupabaseKey(rawKey);

  if (!normalizedUrl || !validKey || !rawKey) {
    if (!hasLoggedConfigWarning) {
      console.log("ℹ️ Supabase credentials not found or unconfigured. Operating with in-memory persistence.");
      hasLoggedConfigWarning = true;
    }
    supabaseClient = null;
    return null;
  }

  if (supabaseClient && lastInitUrl === normalizedUrl && lastInitKey === rawKey) {
    return supabaseClient;
  }

  try {
    supabaseClient = createClient(normalizedUrl, rawKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    lastInitUrl = normalizedUrl;
    lastInitKey = rawKey;
  } catch (err: any) {
    isSupabaseReachable = false;
    lastReachabilityCheck = Date.now();
    supabaseClient = null;
  }

  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  const rawUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  const normalizedUrl = normalizeSupabaseUrl(rawUrl);
  return !!(normalizedUrl && isValidSupabaseKey(key) && isSupabaseReachable);
}

// -------------------------------------------------------------
// USER & PROFILES
// -------------------------------------------------------------

export async function saveProfileToSupabase(profile: Partial<UserProfile> & { phone: string; fullName: string }) {
  if (!isSupabaseReachable) return { success: true, localOnly: true };
  const supabase = getSupabase();
  if (!supabase) return { success: true, localOnly: true };

  try {
    // 1. Upsert into new profiles table
    const profilePayload = {
      phone: profile.phone,
      full_name: profile.fullName,
      email: profile.email || null,
      role: profile.role || "user",
      emergency_contact_name: profile.emergencyContactName || null,
      emergency_contact_phone: profile.emergencyContactPhone || null,
      blood_group: profile.bloodGroup || "O+",
      allergies: profile.allergies || "None reported",
      medical_notes: profile.medicalNotes || "",
      is_sharing_location: !!profile.isSharingLocation,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "phone" })
      .select();

    // 2. Also keep legacy users table synced for backward compatibility
    try {
      await supabase.from("users").upsert({
        phone: profile.phone,
        full_name: profile.fullName,
        emergency_contact: profile.emergencyContactPhone || profile.phone,
        blood_group: profile.bloodGroup || "O+",
        allergies: profile.allergies || "None reported",
        medical_notes: profile.medicalNotes || "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "phone" });
    } catch {}

    if (profileError) {
      if (isNetworkError(profileError)) {
        markSupabaseUnreachable();
        return { success: true, localOnly: true };
      }
      const cleaned = cleanSupabaseError(profileError);
      console.warn("Supabase saveProfile notice:", cleaned);
      return { success: false, error: cleaned };
    }
    return { success: true, data: profileData };
  } catch (err: any) {
    if (isNetworkError(err)) {
      markSupabaseUnreachable();
      return { success: true, localOnly: true };
    }
    const cleaned = cleanSupabaseError(err);
    console.warn("Supabase saveProfile exception:", cleaned);
    return { success: false, error: cleaned };
  }
}

export async function getProfileFromSupabase(phone: string): Promise<UserProfile | null> {
  if (!isSupabaseReachable) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("phone", phone).maybeSingle();
    if (data) {
      return {
        id: data.id,
        phone: data.phone,
        fullName: data.full_name,
        email: data.email,
        role: data.role || "user",
        emergencyContactName: data.emergency_contact_name,
        emergencyContactPhone: data.emergency_contact_phone,
        bloodGroup: data.blood_group,
        allergies: data.allergies,
        medicalNotes: data.medical_notes,
        isSharingLocation: !!data.is_sharing_location,
        lastSeenAt: data.last_seen_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    // Check legacy users table if profiles table is empty or pending migration
    const { data: legacyUser } = await supabase.from("users").select("*").eq("phone", phone).maybeSingle();
    if (legacyUser) {
      return {
        id: legacyUser.id,
        phone: legacyUser.phone,
        fullName: legacyUser.full_name,
        role: "user",
        emergencyContactPhone: legacyUser.emergency_contact,
        bloodGroup: legacyUser.blood_group,
        allergies: legacyUser.allergies,
        medicalNotes: legacyUser.medical_notes,
        isSharingLocation: false,
        createdAt: legacyUser.created_at,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// GUARDIAN INVITATIONS & RELATIONSHIPS
// -------------------------------------------------------------

export async function createGuardianInviteInSupabase(userPhone: string, userName: string): Promise<{ success: boolean; invite?: GuardianInvitation; error?: string }> {
  const supabase = getSupabase();
  
  // Generate random 6-character code like RAK-7842
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const inviteCode = `RAK-${randNum}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  const inviteObj: GuardianInvitation = {
    id: "inv-" + Date.now(),
    userPhone,
    userName,
    inviteCode,
    status: "pending",
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  if (!supabase) {
    return { success: true, invite: inviteObj };
  }

  try {
    const { data, error } = await supabase
      .from("guardian_invitations")
      .insert([
        {
          user_phone: userPhone,
          user_name: userName,
          invite_code: inviteCode,
          status: "pending",
          expires_at: expiresAt,
        },
      ])
      .select()
      .single();

    if (error) {
      const cleaned = cleanSupabaseError(error);
      console.warn("Supabase createGuardianInvite notice:", cleaned);
      return { success: true, invite: inviteObj }; // fallback to local invite
    }

    return {
      success: true,
      invite: {
        id: data.id,
        userPhone: data.user_phone,
        userName: data.user_name,
        inviteCode: data.invite_code,
        status: data.status,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      },
    };
  } catch (err: any) {
    return { success: true, invite: inviteObj };
  }
}

export async function linkGuardianWithCodeInSupabase(params: {
  guardianPhone: string;
  guardianName: string;
  inviteCode: string;
}) {
  const supabase = getSupabase();
  const cleanCode = params.inviteCode.trim().toUpperCase();

  if (!supabase) {
    return { success: false, reason: "supabase_not_configured" };
  }

  try {
    // 1. Find the invite
    const { data: invite, error: inviteErr } = await supabase
      .from("guardian_invitations")
      .select("*")
      .eq("invite_code", cleanCode)
      .eq("status", "pending")
      .maybeSingle();

    if (inviteErr || !invite) {
      return { success: false, error: "Invalid, already accepted, or expired invite code." };
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from("guardian_invitations").update({ status: "expired" }).eq("id", invite.id);
      return { success: false, error: "This invite code has expired. Please ask the user to generate a new one." };
    }

    // 2. Create the relationship
    const { data: rel, error: relErr } = await supabase
      .from("guardian_relationships")
      .upsert(
        [
          {
            user_phone: invite.user_phone,
            user_name: invite.user_name,
            guardian_phone: params.guardianPhone,
            guardian_name: params.guardianName,
            status: "active",
            authorized_at: new Date().toISOString(),
          },
        ],
        { onConflict: "user_phone,guardian_phone" }
      )
      .select()
      .single();

    if (relErr) {
      return { success: false, error: cleanSupabaseError(relErr) };
    }

    // 3. Mark invite as accepted
    await supabase
      .from("guardian_invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    // 4. Log safety event
    await logSafetyEventToSupabase({
      userPhone: invite.user_phone,
      userName: invite.user_name,
      eventType: "guardian_linked",
      details: `Guardian ${params.guardianName} (${params.guardianPhone}) successfully authorized via code ${cleanCode}.`,
    });

    return {
      success: true,
      relationship: rel,
      userPhone: invite.user_phone,
      userName: invite.user_name,
    };
  } catch (err: any) {
    return { success: false, error: cleanSupabaseError(err) };
  }
}

export async function getUserLinkedGuardiansFromSupabase(userPhone: string): Promise<GuardianRelationship[]> {
  if (!isSupabaseReachable) return [];
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("guardian_relationships")
      .select("*")
      .eq("user_phone", userPhone)
      .eq("status", "active")
      .order("authorized_at", { ascending: false });

    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      userPhone: r.user_phone,
      userName: r.user_name,
      guardianPhone: r.guardian_phone,
      guardianName: r.guardian_name,
      status: r.status,
      authorizedAt: r.authorized_at,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getGuardianLinkedUsersFromSupabase(guardianPhone: string): Promise<GuardianRelationship[]> {
  if (!isSupabaseReachable) return [];
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("guardian_relationships")
      .select("*")
      .eq("guardian_phone", guardianPhone)
      .eq("status", "active")
      .order("authorized_at", { ascending: false });

    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      userPhone: r.user_phone,
      userName: r.user_name,
      guardianPhone: r.guardian_phone,
      guardianName: r.guardian_name,
      status: r.status,
      authorizedAt: r.authorized_at,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function revokeGuardianRelationshipInSupabase(relationshipId: string, userPhone: string) {
  const supabase = getSupabase();
  if (!supabase) return { success: false, reason: "supabase_not_configured" };

  try {
    const { data, error } = await supabase
      .from("guardian_relationships")
      .update({ status: "revoked" })
      .eq("id", relationshipId)
      .eq("user_phone", userPhone)
      .select();

    if (error) return { success: false, error: cleanSupabaseError(error) };

    await logSafetyEventToSupabase({
      userPhone,
      eventType: "guardian_revoked",
      details: "Guardian access revoked by the user.",
    });

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: cleanSupabaseError(err) };
  }
}

// -------------------------------------------------------------
// LIVE LOCATION SHARING
// -------------------------------------------------------------

export async function saveLocationUpdateToSupabase(update: LocationUpdate) {
  if (!isSupabaseReachable) return { success: true, localOnly: true };
  const supabase = getSupabase();
  if (!supabase) return { success: true, localOnly: true };

  try {
    // 1. Insert into location_updates
    const { error: locErr } = await supabase.from("location_updates").insert([
      {
        user_phone: update.userPhone,
        latitude: update.latitude,
        longitude: update.longitude,
        accuracy: update.accuracy ?? null,
        speed: update.speed ?? null,
        heading: update.heading ?? null,
        is_sharing: update.isSharing,
        created_at: new Date(update.timestamp).toISOString(),
      },
    ]);

    if (locErr) {
      if (isNetworkError(locErr)) {
        markSupabaseUnreachable();
        return { success: true, localOnly: true };
      }
      console.warn("Supabase location update notice:", cleanSupabaseError(locErr));
      return { success: false, error: cleanSupabaseError(locErr) };
    }

    // 2. Update profile sharing flag & last seen
    try {
      await supabase.from("profiles").update({
        is_sharing_location: update.isSharing,
        last_seen_at: new Date().toISOString(),
      }).eq("phone", update.userPhone);
    } catch {}

    // 3. Keep telemetry_logs updated for backward compatibility
    try {
      await supabase.from("telemetry_logs").insert([
        {
          user_phone: update.userPhone,
          latitude: update.latitude,
          longitude: update.longitude,
          audio_status: "Live Location Tracking Active",
          sos_active: false,
          created_at: new Date(update.timestamp).toISOString(),
        },
      ]);
    } catch {}

    return { success: true };
  } catch (err: any) {
    if (isNetworkError(err)) {
      markSupabaseUnreachable();
      return { success: true, localOnly: true };
    }
    return { success: false, error: cleanSupabaseError(err) };
  }
}

export async function getLatestLocationFromSupabase(userPhone: string): Promise<LocationUpdate | null> {
  if (!isSupabaseReachable) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("location_updates")
      .select("*")
      .eq("user_phone", userPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      userPhone: data.user_phone,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: data.accuracy ? Number(data.accuracy) : null,
      speed: data.speed ? Number(data.speed) : null,
      heading: data.heading ? Number(data.heading) : null,
      isSharing: !!data.is_sharing,
      timestamp: new Date(data.created_at).getTime(),
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// EMERGENCY SOS INCIDENTS
// -------------------------------------------------------------

export async function saveEmergencyIncidentToSupabase(incident: Omit<EmergencyIncident, "id" | "createdAt">): Promise<{ success: boolean; incident?: EmergencyIncident; error?: string }> {
  const newIncident: EmergencyIncident = {
    id: "inc-" + Date.now(),
    ...incident,
    createdAt: new Date().toISOString(),
  };

  if (!isSupabaseReachable) {
    return { success: true, incident: newIncident };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { success: true, incident: newIncident };
  }

  try {
    const { data, error } = await supabase
      .from("emergency_incidents")
      .insert([
        {
          user_phone: incident.userPhone,
          user_name: incident.userName,
          trigger_type: incident.triggerType,
          latitude: incident.latitude ?? null,
          longitude: incident.longitude ?? null,
          status: incident.status || "ACTIVE",
          notes: incident.notes || "",
        },
      ])
      .select()
      .single();

    // Also mirror to legacy sos_incidents
    try {
      await supabase.from("sos_incidents").insert([
        {
          user_phone: incident.userPhone,
          user_name: incident.userName,
          trigger_type: incident.triggerType,
          latitude: incident.latitude ?? null,
          longitude: incident.longitude ?? null,
          status: incident.status || "ACTIVE",
          notes: incident.notes || "",
        },
      ]);
    } catch {}

    // Log safety event
    await logSafetyEventToSupabase({
      userPhone: incident.userPhone,
      userName: incident.userName,
      eventType: "sos_triggered",
      details: `SOS Emergency Alert activated via ${incident.triggerType}. Notes: ${incident.notes || 'Emergency triggered'}`,
    });

    if (error) {
      if (isNetworkError(error)) {
        markSupabaseUnreachable();
        return { success: true, incident: newIncident };
      }
      console.warn("Supabase emergency incident notice:", cleanSupabaseError(error));
      return { success: true, incident: newIncident };
    }

    return {
      success: true,
      incident: {
        id: data.id,
        userPhone: data.user_phone,
        userName: data.user_name,
        triggerType: data.trigger_type,
        latitude: data.latitude ? Number(data.latitude) : null,
        longitude: data.longitude ? Number(data.longitude) : null,
        status: data.status,
        notes: data.notes,
        createdAt: data.created_at,
        resolvedAt: data.resolved_at,
      },
    };
  } catch (err: any) {
    if (isNetworkError(err)) {
      markSupabaseUnreachable();
    }
    return { success: true, incident: newIncident };
  }
}

export async function resolveEmergencyIncidentInSupabase(incidentId: string, notes?: string) {
  if (!isSupabaseReachable) return { success: true, localOnly: true };
  const supabase = getSupabase();
  if (!supabase) return { success: true, localOnly: true };

  try {
    const resolvedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("emergency_incidents")
      .update({
        status: "RESOLVED",
        resolved_at: resolvedAt,
        notes: notes ? notes : "Incident marked as RESOLVED by guardian/user.",
      })
      .eq("id", incidentId)
      .select();

    // Mirror to legacy
    try {
      await supabase.from("sos_incidents").update({
        status: "RESOLVED",
        resolved_at: resolvedAt,
      }).eq("id", incidentId);
    } catch {}

    if (error && isNetworkError(error)) {
      markSupabaseUnreachable();
      return { success: true, localOnly: true };
    }

    return { success: !error, data };
  } catch (err: any) {
    if (isNetworkError(err)) {
      markSupabaseUnreachable();
      return { success: true, localOnly: true };
    }
    return { success: false, error: cleanSupabaseError(err) };
  }
}

export async function getEmergencyIncidentsFromSupabase(userPhone?: string): Promise<EmergencyIncident[]> {
  if (!isSupabaseReachable) return [];
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("emergency_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (userPhone) {
      query = query.eq("user_phone", userPhone);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      // Fallback check on legacy sos_incidents
      const { data: legacy } = await supabase.from("sos_incidents").select("*").order("created_at", { ascending: false }).limit(30);
      if (legacy) {
        return legacy.map((row: any) => ({
          id: row.id,
          userPhone: row.user_phone,
          userName: row.user_name || "User",
          triggerType: row.trigger_type,
          latitude: row.latitude ? Number(row.latitude) : null,
          longitude: row.longitude ? Number(row.longitude) : null,
          status: row.status,
          notes: row.notes,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        }));
      }
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      userPhone: row.user_phone,
      userName: row.user_name,
      triggerType: row.trigger_type,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// SAFETY EVENTS & AUDIT LOGS
// -------------------------------------------------------------

export async function logSafetyEventToSupabase(event: Omit<SafetyEvent, "id" | "createdAt">) {
  if (!isSupabaseReachable) return { success: true, localOnly: true };
  const supabase = getSupabase();
  if (!supabase) return { success: true, localOnly: true };

  try {
    const { data, error } = await supabase.from("safety_events").insert([
      {
        user_phone: event.userPhone,
        user_name: event.userName || "User",
        event_type: event.eventType,
        details: event.details,
        metadata: event.metadata || {},
      },
    ]);

    if (error) {
      if (isNetworkError(error)) {
        markSupabaseUnreachable();
        return { success: true, localOnly: true };
      }
      console.warn("Supabase logSafetyEvent notice:", cleanSupabaseError(error));
      return { success: false, error: cleanSupabaseError(error) };
    }
    return { success: true, data };
  } catch (err: any) {
    if (isNetworkError(err)) {
      markSupabaseUnreachable();
      return { success: true, localOnly: true };
    }
    return { success: false, error: cleanSupabaseError(err) };
  }
}

export async function getSafetyEventsFromSupabase(userPhone?: string): Promise<SafetyEvent[]> {
  if (!isSupabaseReachable) return [];
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    let query = supabase.from("safety_events").select("*").order("created_at", { ascending: false }).limit(40);
    if (userPhone) {
      query = query.eq("user_phone", userPhone);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((d: any) => ({
      id: d.id,
      userPhone: d.user_phone,
      userName: d.user_name,
      eventType: d.event_type,
      details: d.details,
      metadata: d.metadata,
      createdAt: d.created_at,
    }));
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// LEGACY HELPERS PRESERVED
// -------------------------------------------------------------
export async function saveUserToSupabase(userData: any) {
  return saveProfileToSupabase({
    phone: userData.phone,
    fullName: userData.fullName,
    emergencyContactPhone: userData.emergencyContact,
    bloodGroup: userData.bloodGroup,
    allergies: userData.allergies,
    medicalNotes: userData.medicalNotes,
  });
}

export async function saveTelemetryToSupabase(telemetry: any) {
  return saveLocationUpdateToSupabase({
    userPhone: telemetry.userPhone,
    latitude: telemetry.latitude || 0,
    longitude: telemetry.longitude || 0,
    isSharing: true,
    timestamp: Date.now(),
  });
}

export async function saveIncidentToSupabase(incident: any) {
  return saveEmergencyIncidentToSupabase({
    userPhone: incident.userPhone,
    userName: incident.userName || "User",
    triggerType: incident.triggerType || "manual_sos",
    latitude: incident.latitude,
    longitude: incident.longitude,
    status: incident.status || "ACTIVE",
    notes: incident.notes,
  });
}

export async function saveGuardianConnectionToSupabase(guardian: any) {
  return { success: true };
}

export async function getIncidentsFromSupabase(userPhone?: string) {
  return getEmergencyIncidentsFromSupabase(userPhone);
}

export async function getGuardiansFromSupabase(targetPhone?: string) {
  return getUserLinkedGuardiansFromSupabase(targetPhone || "");
}

export async function getUserProfileFromSupabase(phone: string) {
  return getProfileFromSupabase(phone);
}
