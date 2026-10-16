import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { 
  saveProfileToSupabase,
  getProfileFromSupabase,
  createGuardianInviteInSupabase,
  linkGuardianWithCodeInSupabase,
  getUserLinkedGuardiansFromSupabase,
  getGuardianLinkedUsersFromSupabase,
  revokeGuardianRelationshipInSupabase,
  saveLocationUpdateToSupabase,
  getLatestLocationFromSupabase,
  saveEmergencyIncidentToSupabase,
  resolveEmergencyIncidentInSupabase,
  getEmergencyIncidentsFromSupabase,
  logSafetyEventToSupabase,
  getSafetyEventsFromSupabase,
  isSupabaseConfigured 
} from "./src/server/supabase";

// In-memory fallback stores for high-speed responsiveness
const stateStore: Record<string, any> = {};
const activeInvitesStore: Record<string, any> = {};
const relationshipsStore: Record<string, any[]> = {};
const locationStore: Record<string, any> = {};
const incidentStore: any[] = [];
const safetyEventsStore: any[] = [];
const voiceClipsStore: Record<string, any[]> = {};
const permissionsStore: Record<string, {
  camera: boolean;
  microphone: boolean;
  location: boolean;
  updatedAt: string;
  updatedBy: 'user' | 'guardian';
  requests?: {
    camera?: boolean;
    microphone?: boolean;
    location?: boolean;
    requestedAt?: string;
  };
}> = {};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Status & Supabase Connection Check
  app.get("/api/supabase-status", (req, res) => {
    const configured = isSupabaseConfigured();
    res.json({
      configured,
      projectName: "Rakshika_Ai",
      projectId: "sjkxawsbtxgxwemusash",
      tables: [
        "profiles", 
        "guardian_relationships", 
        "guardian_invitations", 
        "location_updates", 
        "emergency_incidents", 
        "safety_events"
      ],
      message: configured 
        ? "Connected to Supabase project 'Rakshika_Ai'" 
        : "Operating with local-first in-memory & IndexedDB safety storage."
    });
  });

  // -------------------------------------------------------------
  // USER PROFILES & AUTH SYNC
  // -------------------------------------------------------------

  app.post("/api/profile", async (req, res) => {
    const { phone, fullName, email, role, emergencyContactName, emergencyContactPhone, bloodGroup, allergies, medicalNotes } = req.body;
    if (!phone || !fullName) {
      return res.status(400).json({ error: "phone and fullName are required" });
    }

    const profileData = {
      phone,
      fullName,
      email,
      role: role || "user",
      emergencyContactName,
      emergencyContactPhone,
      bloodGroup: bloodGroup || "O+",
      allergies: allergies || "None reported",
      medicalNotes: medicalNotes || "",
      isSharingLocation: false,
    };

    stateStore[phone] = { ...(stateStore[phone] || {}), profile: profileData };

    const supabaseResult = await saveProfileToSupabase(profileData);
    res.json({ success: true, profile: profileData, supabase: supabaseResult });
  });

  // Legacy user register route
  app.post("/api/register-user", async (req, res) => {
    const { phone, fullName, emergencyContact, bloodGroup, allergies, medicalNotes, email, role } = req.body;
    if (!phone || !fullName) {
      return res.status(400).json({ error: "Missing required fields (phone, fullName)" });
    }

    const supabaseResult = await saveProfileToSupabase({
      phone,
      fullName,
      email,
      role: role || "user",
      emergencyContactPhone: emergencyContact || phone,
      bloodGroup: bloodGroup || "O+",
      allergies: allergies || "None reported",
      medicalNotes: medicalNotes || "",
      isSharingLocation: false,
    });

    res.json({ success: true, supabase: supabaseResult });
  });

  app.get("/api/user/:phone", async (req, res) => {
    const phone = req.params.phone;
    const profile = await getProfileFromSupabase(phone);
    if (profile) {
      return res.json(profile);
    }
    if (stateStore[phone]?.profile) {
      return res.json(stateStore[phone].profile);
    }
    res.status(404).json({ error: "Profile not found" });
  });

  // -------------------------------------------------------------
  // GUARDIAN LINKING & INVITATIONS
  // -------------------------------------------------------------

  // User generates an invite code
  app.post("/api/guardian/invite", async (req, res) => {
    const { userPhone, userName, userProfile } = req.body;
    if (!userPhone || !userName) {
      return res.status(400).json({ error: "userPhone and userName required" });
    }

    const result = await createGuardianInviteInSupabase(userPhone, userName);
    const inviteObj = result.invite || {
      id: "inv-" + Date.now(),
      userPhone,
      userName,
      inviteCode: `RAK-${Math.floor(1000 + Math.random() * 9000)}`,
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Store in active invites cache with full profile
    activeInvitesStore[inviteObj.inviteCode] = {
      ...inviteObj,
      userProfile: userProfile || stateStore[userPhone]?.profile || null,
    };

    if (userProfile) {
      stateStore[userPhone] = {
        ...(stateStore[userPhone] || {}),
        profile: userProfile,
        userName,
        userPhone,
      };
    }

    res.json({ success: true, invite: inviteObj });
  });

  // Guardian enters invite code to authorize connection
  app.post("/api/guardian/link", async (req, res) => {
    const { guardianPhone, guardianName, inviteCode } = req.body;
    if (!guardianPhone || !guardianName || !inviteCode) {
      return res.status(400).json({ error: "guardianPhone, guardianName, and inviteCode required" });
    }

    const cleanCode = inviteCode.trim().toUpperCase();
    const result = await linkGuardianWithCodeInSupabase({
      guardianPhone,
      guardianName,
      inviteCode: cleanCode,
    });

    const inviteFromStore = activeInvitesStore[cleanCode];
    const targetUserPhone = result.userPhone || inviteFromStore?.userPhone;
    const targetUserName = result.userName || inviteFromStore?.userName || "User";

    if (!targetUserPhone) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired invite code. Please ask the user to generate a new 6-character code.",
      });
    }

    const rel = {
      id: "rel-" + Date.now(),
      userPhone: targetUserPhone,
      userName: targetUserName,
      guardianPhone,
      guardianName,
      status: "active",
      authorizedAt: new Date().toISOString(),
    };

    relationshipsStore[guardianPhone] = relationshipsStore[guardianPhone] || [];
    relationshipsStore[guardianPhone] = relationshipsStore[guardianPhone].filter(r => r.userPhone !== targetUserPhone);
    relationshipsStore[guardianPhone].push(rel);

    relationshipsStore[targetUserPhone] = relationshipsStore[targetUserPhone] || [];
    relationshipsStore[targetUserPhone] = relationshipsStore[targetUserPhone].filter(r => r.guardianPhone !== guardianPhone);
    relationshipsStore[targetUserPhone].push(rel);

    // Get latest profile to share ALL important info
    let profileData = stateStore[targetUserPhone]?.profile || inviteFromStore?.userProfile;
    if (!profileData) {
      profileData = await getProfileFromSupabase(targetUserPhone);
    }
    if (!profileData) {
      profileData = {
        fullName: targetUserName,
        phone: targetUserPhone,
        bloodGroup: "O+",
        allergies: "None reported",
        medicalNotes: "Profile active on Rakshika AI",
        emergencyContactName: "Father (Rajesh)",
        emergencyContactPhone: "+91 98111 22334",
      };
    }

    // Ensure stateStore has user info
    stateStore[targetUserPhone] = {
      ...(stateStore[targetUserPhone] || {}),
      profile: profileData,
      userName: targetUserName,
      userPhone: targetUserPhone,
      isSharingLocation: true,
      timestamp: Date.now(),
    };

    res.json({
      success: true,
      relationship: rel,
      userPhone: targetUserPhone,
      userName: targetUserName,
      userProfile: profileData,
    });
  });

  // Fetch users linked to this guardian (with ALL important info: profile, medical, location, state)
  app.get("/api/guardian/linked-users", async (req, res) => {
    const guardianPhone = req.query.guardianPhone as string;
    if (!guardianPhone) {
      return res.status(400).json({ error: "guardianPhone query required" });
    }

    const dbUsers = await getGuardianLinkedUsersFromSupabase(guardianPhone);
    const memUsers = (relationshipsStore[guardianPhone] || []).filter(r => r.status === "active");

    // Merge by userPhone
    const map = new Map<string, any>();
    for (const u of memUsers) {
      map.set(u.userPhone, u);
    }
    for (const u of dbUsers) {
      map.set(u.userPhone, u);
    }

    const allLinked = Array.from(map.values());

    // Enrich every single linked user with full important information
    const enriched = await Promise.all(allLinked.map(async (rel) => {
      const uPhone = rel.userPhone;
      let prof = stateStore[uPhone]?.profile;
      if (!prof) {
        prof = await getProfileFromSupabase(uPhone);
      }
      if (!prof) {
        prof = {
          fullName: rel.userName,
          phone: uPhone,
          bloodGroup: "O+",
          allergies: "None reported",
          medicalNotes: "Profile active on Rakshika AI",
          emergencyContactName: "Father (Rajesh)",
          emergencyContactPhone: "+91 98111 22334",
        };
      }

      const loc = locationStore[uPhone] || (await getLatestLocationFromSupabase(uPhone)) || null;
      const st = stateStore[uPhone] || {};
      const activeInc = incidentStore.find(i => i.userPhone === uPhone && i.status === "ACTIVE") || st.activeIncident || null;

      return {
        ...rel,
        profile: prof,
        location: loc,
        isSharingLocation: st.isSharingLocation !== undefined ? !!st.isSharingLocation : (loc ? !!loc.isSharing : true),
        sosActive: !!activeInc || !!st.sosActive,
        activeIncident: activeInc,
        audioStatus: st.audioStatus || (activeInc ? "EMERGENCY DISTRESS DETECTED" : "Normal ambient noise - Voice Shield Active"),
      };
    }));

    res.json(enriched);
  });

  // Fetch guardians linked to this user
  app.get("/api/guardian/linked-guardians", async (req, res) => {
    const userPhone = req.query.userPhone as string;
    if (!userPhone) {
      return res.status(400).json({ error: "userPhone query required" });
    }

    const dbGuardians = await getUserLinkedGuardiansFromSupabase(userPhone);
    const memGuardians = (relationshipsStore[userPhone] || []).filter(r => r.status === "active");

    const map = new Map<string, any>();
    for (const g of memGuardians) map.set(g.guardianPhone, g);
    for (const g of dbGuardians) map.set(g.guardianPhone, g);

    res.json(Array.from(map.values()));
  });

  // User revokes guardian access
  app.post("/api/guardian/revoke", async (req, res) => {
    const { relationshipId, userPhone, guardianPhone } = req.body;
    if (!userPhone) {
      return res.status(400).json({ error: "userPhone required" });
    }

    if (relationshipId) {
      await revokeGuardianRelationshipInSupabase(relationshipId, userPhone);
    }

    // Memory cleanup
    if (relationshipsStore[userPhone]) {
      relationshipsStore[userPhone] = relationshipsStore[userPhone].map(r => 
        (r.id === relationshipId || r.guardianPhone === guardianPhone) ? { ...r, status: "revoked" } : r
      );
    }
    if (guardianPhone && relationshipsStore[guardianPhone]) {
      relationshipsStore[guardianPhone] = relationshipsStore[guardianPhone].map(r => 
        (r.id === relationshipId || r.userPhone === userPhone) ? { ...r, status: "revoked" } : r
      );
    }

    res.json({ success: true, message: "Guardian authorization revoked successfully." });
  });

  // -------------------------------------------------------------
  // BIDIRECTIONAL GUARDIAN ACCESS PERMISSIONS & REQUESTS
  // (Camera, Microphone, Live GPS Location)
  // -------------------------------------------------------------

  // Get current access permissions & pending requests for a user
  app.get("/api/guardian/permissions/:phone", async (req, res) => {
    const phone = req.params.phone;
    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }

    let perm = permissionsStore[phone];
    if (!perm) {
      // Default initial state: all 3 permissions authorized for the guardian
      perm = {
        camera: true,
        microphone: true,
        location: true,
        updatedAt: new Date().toISOString(),
        updatedBy: 'user',
        requests: {},
      };
      permissionsStore[phone] = perm;
    }

    res.json({ success: true, permissions: perm });
  });

  // User sets or updates granted permissions (Camera, Microphone, Location)
  app.post("/api/guardian/permissions/update", async (req, res) => {
    const { userPhone, permissions, updatedBy } = req.body;
    if (!userPhone || !permissions) {
      return res.status(400).json({ error: "userPhone and permissions required" });
    }

    const current = permissionsStore[userPhone] || {
      camera: true,
      microphone: true,
      location: true,
      requests: {},
    };

    const nextPerm = {
      ...current,
      camera: permissions.camera !== undefined ? Boolean(permissions.camera) : current.camera,
      microphone: permissions.microphone !== undefined ? Boolean(permissions.microphone) : current.microphone,
      location: permissions.location !== undefined ? Boolean(permissions.location) : current.location,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'user',
    };

    // If permission was granted, clear any corresponding pending request
    if (nextPerm.requests) {
      const reqObj = nextPerm.requests as Record<string, any>;
      if (nextPerm.camera) delete reqObj.camera;
      if (nextPerm.microphone) delete reqObj.microphone;
      if (nextPerm.location) delete reqObj.location;
    }

    permissionsStore[userPhone] = nextPerm;

    // Synchronize to stateStore
    if (stateStore[userPhone]) {
      stateStore[userPhone].guardianPermissions = nextPerm;
      stateStore[userPhone].isSharingLocation = nextPerm.location;
    }

    // Broadcast permission update to any connected guardian/user WebSocket clients
    broadcastToGuardians(userPhone, {
      type: "guardian_permission_updated",
      userPhone,
      permissions: nextPerm,
    });
    broadcastToUser(userPhone, {
      type: "guardian_permission_updated",
      userPhone,
      permissions: nextPerm,
    });

    res.json({ success: true, permissions: nextPerm });
  });

  // Guardian requests permission access or user responds to request
  app.post("/api/guardian/permissions/request", async (req, res) => {
    const { userPhone, guardianPhone, guardianName, requestedPermissions } = req.body;
    if (!userPhone || !requestedPermissions) {
      return res.status(400).json({ error: "userPhone and requestedPermissions required" });
    }

    const current = permissionsStore[userPhone] || {
      camera: false,
      microphone: false,
      location: false,
      updatedAt: new Date().toISOString(),
      updatedBy: 'user',
      requests: {},
    };

    current.requests = {
      ...(current.requests || {}),
      ...requestedPermissions,
      requestedAt: new Date().toISOString(),
      guardianPhone,
      guardianName: guardianName || "Guardian",
    };

    permissionsStore[userPhone] = current;

    if (stateStore[userPhone]) {
      stateStore[userPhone].guardianPermissions = current;
    }

    // Broadcast live alert to the user on their active device
    broadcastToUser(userPhone, {
      type: "guardian_access_requested",
      userPhone,
      guardianPhone,
      guardianName: guardianName || "Guardian",
      requests: current.requests,
      timestamp: Date.now(),
    });

    res.json({ success: true, permissions: current });
  });

  // Legacy guardian login
  app.post("/api/guardian-login", async (req, res) => {
    const { guardianName, targetPhone } = req.body;
    res.json({ success: true, message: "Guardian session registered" });
  });

  // -------------------------------------------------------------
  // LIVE LOCATION SHARING (Accepts both /api/location and /api/location/update)
  // -------------------------------------------------------------

  const handleLocationUpdate = async (req: express.Request, res: express.Response) => {
    const userPhone = req.body.userPhone || req.body.phone;
    const loc = req.body.location || req.body;

    if (!userPhone) {
      return res.status(400).json({ error: "userPhone or phone is required" });
    }

    const latitude = loc.latitude ?? loc.lat ?? 19.0760;
    const longitude = loc.longitude ?? loc.lng ?? 72.8777;
    const accuracy = loc.accuracy ?? 10;
    const speed = loc.speed ?? 0;
    const heading = loc.heading ?? 0;
    const isSharing = loc.isSharing !== undefined 
      ? !!loc.isSharing 
      : (req.body.isSharing !== undefined ? !!req.body.isSharing : true);

    const update = {
      userPhone,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: accuracy ? Number(accuracy) : null,
      speed: speed ? Number(speed) : null,
      heading: heading ? Number(heading) : null,
      isSharing,
      timestamp: Date.now(),
    };

    locationStore[userPhone] = update;
    stateStore[userPhone] = {
      ...(stateStore[userPhone] || {}),
      location: update,
      isSharingLocation: isSharing,
      timestamp: Date.now(),
    };

    saveLocationUpdateToSupabase(update).catch(() => {});
    res.json({ success: true, update });
  };

  app.post("/api/location", handleLocationUpdate);
  app.post("/api/location/update", handleLocationUpdate);

  app.get("/api/location/:userPhone", async (req, res) => {
    const userPhone = req.params.userPhone;
    if (locationStore[userPhone]) {
      return res.json(locationStore[userPhone]);
    }
    const dbLoc = await getLatestLocationFromSupabase(userPhone);
    if (dbLoc) {
      return res.json(dbLoc);
    }
    res.json({
      userPhone,
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 15,
      speed: 0,
      heading: 0,
      isSharing: true,
      timestamp: Date.now(),
    });
  });

  // -------------------------------------------------------------
  // EMERGENCY SOS INCIDENTS (Supports both /api/incidents/create and /api/sos-incident)
  // -------------------------------------------------------------

  const handleIncidentCreate = async (req: express.Request, res: express.Response) => {
    const userPhone = req.body.userPhone || req.body.phone;
    const userName = req.body.userName || "User";
    const triggerType = req.body.triggerType || "manual_sos";
    const location = req.body.location;
    const notes = req.body.notes || `Emergency incident triggered via ${triggerType}`;

    if (!userPhone) {
      return res.status(400).json({ error: "userPhone or phone is required" });
    }

    const lat = location?.lat ?? location?.latitude ?? 19.0760;
    const lng = location?.lng ?? location?.longitude ?? 72.8777;

    const result = await saveEmergencyIncidentToSupabase({
      userPhone,
      userName,
      triggerType,
      latitude: Number(lat),
      longitude: Number(lng),
      status: "ACTIVE",
      notes,
    });

    const incident = result.incident || {
      id: "inc-" + Date.now(),
      userPhone,
      userName,
      triggerType,
      latitude: Number(lat),
      longitude: Number(lng),
      status: "ACTIVE",
      notes,
      createdAt: new Date().toISOString(),
    };

    incidentStore.unshift(incident);
    if (incidentStore.length > 50) incidentStore.pop();

    // Sync into stateStore so live guardians see it IMMEDIATELY
    stateStore[userPhone] = {
      ...(stateStore[userPhone] || {}),
      userPhone,
      userName,
      sosActive: true,
      activeIncident: incident,
      audioStatus: `EMERGENCY DISTRESS DETECTED (${triggerType})`,
      timestamp: Date.now(),
    };

    // Log safety event
    const evt = {
      id: "evt-" + Date.now(),
      userPhone,
      userName,
      eventType: "sos_triggered",
      details: `Emergency distress triggered via ${triggerType}: ${notes}`,
      createdAt: new Date().toISOString(),
    };
    safetyEventsStore.unshift(evt);
    logSafetyEventToSupabase({
      userPhone,
      userName,
      eventType: "sos_triggered",
      details: evt.details,
    }).catch(() => {});

    res.json({ success: true, incident });
  };

  app.post("/api/incidents/create", handleIncidentCreate);
  app.post("/api/sos-incident", handleIncidentCreate);

  const handleIncidentResolve = async (req: express.Request, res: express.Response) => {
    const incidentId = req.params.id || req.body.incidentId;
    const userPhone = req.body.userPhone || req.body.phone;
    const notes = req.body.notes || "Emergency marked as RESOLVED.";

    if (incidentId) {
      await resolveEmergencyIncidentInSupabase(incidentId, notes).catch(() => {});
    }

    // Update memory incident store
    for (const inc of incidentStore) {
      if (inc.id === incidentId || (userPhone && inc.userPhone === userPhone && inc.status === "ACTIVE")) {
        inc.status = "RESOLVED";
        inc.resolvedAt = new Date().toISOString();
        if (notes) inc.notes = (inc.notes || "") + ` [Resolved: ${notes}]`;
      }
    }

    // Clear active incident in stateStore
    if (userPhone && stateStore[userPhone]) {
      stateStore[userPhone].sosActive = false;
      stateStore[userPhone].activeIncident = null;
      stateStore[userPhone].audioStatus = "All safe. Voice Shield Guard Active.";
      stateStore[userPhone].timestamp = Date.now();
    } else {
      for (const phone of Object.keys(stateStore)) {
        if (stateStore[phone].activeIncident?.id === incidentId) {
          stateStore[phone].sosActive = false;
          stateStore[phone].activeIncident = null;
          stateStore[phone].audioStatus = "All safe. Voice Shield Guard Active.";
          stateStore[phone].timestamp = Date.now();
        }
      }
    }

    if (userPhone) {
      const evt = {
        id: "evt-" + Date.now(),
        userPhone,
        userName: stateStore[userPhone]?.userName || "User",
        eventType: "sos_resolved",
        details: notes,
        createdAt: new Date().toISOString(),
      };
      safetyEventsStore.unshift(evt);
      logSafetyEventToSupabase({
        userPhone,
        userName: evt.userName,
        eventType: "sos_resolved",
        details: notes,
      }).catch(() => {});
    }

    res.json({ success: true, message: "Emergency incident marked as resolved." });
  };

  app.post("/api/incidents/resolve/:id", handleIncidentResolve);
  app.post("/api/incidents/resolve", handleIncidentResolve);

  app.get("/api/incidents", async (req, res) => {
    const userPhone = req.query.phone as string | undefined;
    const dbIncidents = await getEmergencyIncidentsFromSupabase(userPhone);

    if (dbIncidents && dbIncidents.length > 0) {
      return res.json(dbIncidents);
    }

    const filtered = userPhone 
      ? incidentStore.filter(i => i.userPhone === userPhone)
      : incidentStore;
    res.json(filtered);
  });

  // -------------------------------------------------------------
  // SAFETY EVENTS & AUDIT LOGS (Accepts both /api/safety-event and /api/safety-events/create)
  // -------------------------------------------------------------

  const handleSafetyEventCreate = async (req: express.Request, res: express.Response) => {
    const userPhone = req.body.userPhone || req.body.phone;
    const userName = req.body.userName || "User";
    const eventType = req.body.eventType || "status_check";
    const details = req.body.details || "Telemetry status event logged.";

    if (!userPhone) {
      return res.status(400).json({ error: "userPhone is required" });
    }

    const eventObj = {
      id: "ev-" + Date.now(),
      userPhone,
      userName,
      eventType,
      details,
      createdAt: new Date().toISOString(),
    };

    safetyEventsStore.unshift(eventObj);
    if (safetyEventsStore.length > 100) safetyEventsStore.pop();

    logSafetyEventToSupabase(eventObj).catch(() => {});
    res.json({ success: true, event: eventObj });
  };

  app.post("/api/safety-event", handleSafetyEventCreate);
  app.post("/api/safety-events/create", handleSafetyEventCreate);

  app.get("/api/safety-events", async (req, res) => {
    const userPhone = req.query.phone as string | undefined;
    const dbEvents = await getSafetyEventsFromSupabase(userPhone);

    if (dbEvents && dbEvents.length > 0) {
      return res.json(dbEvents);
    }

    const filtered = userPhone 
      ? safetyEventsStore.filter(e => e.userPhone === userPhone)
      : safetyEventsStore;
    res.json(filtered);
  });

  // -------------------------------------------------------------
  // SECURE VOICE MESSAGES & AUDIO CLIPS FOR GUARDIAN
  // -------------------------------------------------------------

  app.post("/api/voice-clips", async (req, res) => {
    try {
      const { userPhone, userName, audioBase64, mimeType, durationSeconds, title, tag, coordinates } = req.body;
      if (!userPhone || !audioBase64) {
        return res.status(400).json({ error: "userPhone and audioBase64 are required" });
      }

      const clipId = `vc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const voiceClip = {
        id: clipId,
        userPhone,
        userName: userName || stateStore[userPhone]?.userName || "User",
        audioBase64,
        mimeType: mimeType || "audio/webm",
        durationSeconds: Number(durationSeconds) || 0,
        title: title || "Voice message for guardian",
        tag: tag || "general",
        coordinates: coordinates || stateStore[userPhone]?.location || null,
        createdAt: new Date().toISOString(),
        listenedByGuardian: false,
      };

      if (!voiceClipsStore[userPhone]) {
        voiceClipsStore[userPhone] = [];
      }
      voiceClipsStore[userPhone].unshift(voiceClip);
      if (voiceClipsStore[userPhone].length > 50) {
        voiceClipsStore[userPhone].pop();
      }

      // Update stateStore for instantaneous live sync with guardian
      stateStore[userPhone] = {
        ...(stateStore[userPhone] || {}),
        latestVoiceClip: voiceClip,
        audioStatus: tag === 'sos' 
          ? `EMERGENCY VOICE MESSAGE: "${voiceClip.title}"`
          : `Voice message shared: "${voiceClip.title}" (${voiceClip.durationSeconds}s)`,
        timestamp: Date.now(),
      };

      // Also log as safety event in audit trail
      const safetyEvent = {
        id: "ev-" + Date.now(),
        userPhone,
        userName: voiceClip.userName,
        eventType: "voice_clip_shared" as const,
        details: `Voice clip recorded and shared with guardian: "${voiceClip.title}" (${voiceClip.durationSeconds}s, tag: ${voiceClip.tag})`,
        metadata: {
          clipId: voiceClip.id,
          durationSeconds: voiceClip.durationSeconds,
          tag: voiceClip.tag,
        },
        createdAt: voiceClip.createdAt,
      };
      safetyEventsStore.unshift(safetyEvent);
      logSafetyEventToSupabase(safetyEvent).catch(() => {});

      res.json({ success: true, voiceClip });
    } catch (err: any) {
      console.error("Error saving voice clip:", err);
      res.status(500).json({ error: "Failed to upload voice clip" });
    }
  });

  app.get("/api/voice-clips/:phone", (req, res) => {
    const phone = req.params.phone;
    const clips = voiceClipsStore[phone] || [];
    res.json(clips);
  });

  app.post("/api/voice-clips/:id/listen", (req, res) => {
    const clipId = req.params.id;
    for (const phone of Object.keys(voiceClipsStore)) {
      const clip = voiceClipsStore[phone].find(c => c.id === clipId);
      if (clip) {
        clip.listenedByGuardian = true;
        return res.json({ success: true, clip });
      }
    }
    res.json({ success: true, message: "Acknowledged" });
  });

  // -------------------------------------------------------------
  // LIVE COMBINED STATE STORE (For instantaneous 1-second sync)
  // -------------------------------------------------------------

  app.post("/api/state", async (req, res) => {
    const { phone, state } = req.body;
    if (phone && state) {
      stateStore[phone] = { ...(stateStore[phone] || {}), ...state, timestamp: Date.now() };
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Missing phone or state" });
    }
  });

  app.get("/api/state/:phone", async (req, res) => {
    const phone = req.params.phone;
    let st = stateStore[phone];
    if (!st) {
      const loc = locationStore[phone] || (await getLatestLocationFromSupabase(phone)) || null;
      const activeInc = incidentStore.find(i => i.userPhone === phone && i.status === "ACTIVE") || null;
      const prof = await getProfileFromSupabase(phone);
      st = {
        userPhone: phone,
        userName: prof?.fullName || "User",
        profile: prof || null,
        location: loc,
        isSharingLocation: loc ? !!loc.isSharing : true,
        sosActive: !!activeInc,
        activeIncident: activeInc,
        audioStatus: activeInc ? "EMERGENCY DISTRESS DETECTED" : "Normal ambient noise - Voice Shield Active",
        timestamp: Date.now(),
      };
      stateStore[phone] = st;
    }
    res.json(st);
  });

  // Aggregated Guardian Telemetry Endpoint (Single lightweight fetch for resilient real-time polling)
  app.get("/api/guardian/telemetry/:phone", async (req, res) => {
    try {
      const phone = req.params.phone;
      if (!phone) {
        return res.status(400).json({ error: "phone required" });
      }

      let st = stateStore[phone];
      let loc = locationStore[phone];
      if (!loc) {
        loc = await getLatestLocationFromSupabase(phone);
      }
      if (!loc) {
        loc = {
          userPhone: phone,
          latitude: 19.0760,
          longitude: 72.8777,
          accuracy: 12,
          speed: 0,
          heading: 0,
          isSharing: true,
          timestamp: Date.now(),
        };
      }

      const activeInc = incidentStore.find(i => i.userPhone === phone && i.status === "ACTIVE") || st?.activeIncident || null;
      let prof = st?.profile;
      if (!prof) {
        prof = await getProfileFromSupabase(phone);
      }
      if (!prof) {
        prof = {
          fullName: "Protected User",
          phone,
          bloodGroup: "O+",
          allergies: "None reported",
          medicalNotes: "Profile active on Rakshika AI",
          emergencyContactName: "Father (Rajesh)",
          emergencyContactPhone: "+91 98111 22334",
        };
      }

      const userIncidents = incidentStore.filter(i => i.userPhone === phone).slice(0, 15);
      const userEvents = safetyEventsStore.filter(e => e.userPhone === phone).slice(0, 20);
      const userVoiceClips = voiceClipsStore[phone] || [];
      const latestClip = st?.latestVoiceClip || userVoiceClips[0] || null;
      let userPermissions = permissionsStore[phone] || st?.guardianPermissions;
      if (!userPermissions) {
        userPermissions = {
          camera: true,
          microphone: true,
          location: true,
          updatedAt: new Date().toISOString(),
          updatedBy: 'user',
          requests: {},
        };
        permissionsStore[phone] = userPermissions;
      }

      const combinedState = {
        userPhone: phone,
        userName: prof.fullName,
        profile: prof,
        location: loc,
        isSharingLocation: userPermissions ? userPermissions.location : (st?.isSharingLocation !== undefined ? !!st.isSharingLocation : !!loc.isSharing),
        guardianPermissions: userPermissions,
        sosActive: !!activeInc || !!st?.sosActive,
        activeIncident: activeInc,
        audioStatus: st?.audioStatus || (activeInc ? "EMERGENCY DISTRESS DETECTED" : "Safe ambient audio - Voice Shield Active"),
        latestVoiceClip: latestClip,
        timestamp: st?.timestamp || Date.now(),
      };

      res.json({
        success: true,
        state: combinedState,
        location: loc,
        permissions: userPermissions,
        activeIncident: activeInc,
        incidentLogs: userIncidents,
        safetyEvents: userEvents,
        profile: prof,
        latestVoiceClip: latestClip,
        voiceClips: userVoiceClips,
      });
    } catch (err) {
      console.error("Error in /api/guardian/telemetry:", err);
      res.status(500).json({ error: "Failed to gather telemetry" });
    }
  });

  // -------------------------------------------------------------
  // VITE MIDDLEWARE OR STATIC SERVING
  // -------------------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // -------------------------------------------------------------
  // REAL-TIME LIVE COMMUNICATION & SURVEILLANCE RELAY (WEBSOCKET)
  // -------------------------------------------------------------

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  interface ConnectedClient {
    ws: WebSocket;
    role: "user" | "guardian";
    phone: string;
    userName?: string;
    targetUserPhone?: string;
  }

  const liveClients = new Set<ConnectedClient>();

  function broadcastToGuardians(userPhone: string, message: any) {
    const payload = JSON.stringify(message);
    for (const client of liveClients) {
      if (
        client.role === "guardian" &&
        client.targetUserPhone === userPhone &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(payload);
      }
    }
  }

  function broadcastToUser(userPhone: string, message: any) {
    const payload = JSON.stringify(message);
    for (const client of liveClients) {
      if (
        client.role === "user" &&
        client.phone === userPhone &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(payload);
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    let currentClient: ConnectedClient | null = null;

    ws.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());

        // 1. Client Registration
        if (msg.type === "register") {
          currentClient = {
            ws,
            role: msg.role,
            phone: msg.phone,
            userName: msg.userName,
            targetUserPhone: msg.targetUserPhone,
          };
          liveClients.add(currentClient);

          if (msg.role === "user") {
            broadcastToGuardians(msg.phone, {
              type: "user_live_status",
              userPhone: msg.phone,
              isOnline: true,
              hasCamera: true,
              hasMic: true,
            });
          } else if (msg.role === "guardian" && msg.targetUserPhone) {
            // Inform user that a guardian connected to live stream
            broadcastToUser(msg.targetUserPhone, {
              type: "guardian_connected",
              guardianPhone: msg.phone,
              guardianName: msg.userName || "Guardian",
            });
          }
          return;
        }

        // 2. Live Camera Video Frames Relay
        if (msg.type === "live_camera_frame") {
          broadcastToGuardians(msg.userPhone, {
            type: "live_camera_frame",
            userPhone: msg.userPhone,
            frame: msg.frame,
            timestamp: msg.timestamp || Date.now(),
          });
          // Cache latest camera frame in memory for telemetry polling
          if (stateStore[msg.userPhone]) {
            stateStore[msg.userPhone].lastImage = msg.frame;
            stateStore[msg.userPhone].lastCameraTimestamp = Date.now();
          }
          return;
        }

        // 3. Live Microphone Audio Chunk Relay
        if (msg.type === "live_audio_chunk") {
          broadcastToGuardians(msg.userPhone, {
            type: "live_audio_chunk",
            userPhone: msg.userPhone,
            pcm: msg.pcm,
            sampleRate: msg.sampleRate || 16000,
            volume: msg.volume || 0,
            timestamp: msg.timestamp || Date.now(),
          });
          if (stateStore[msg.userPhone]) {
            stateStore[msg.userPhone].liveAudioVolume = msg.volume || 0;
            stateStore[msg.userPhone].lastAudioTimestamp = Date.now();
          }
          return;
        }

        // 4. Two-Way Intercom: Guardian talks back to User
        if (msg.type === "guardian_talk_chunk") {
          broadcastToUser(msg.userPhone, {
            type: "guardian_talk_chunk",
            guardianPhone: msg.guardianPhone,
            guardianName: msg.guardianName || "Guardian",
            pcm: msg.pcm,
            sampleRate: msg.sampleRate || 16000,
            timestamp: msg.timestamp || Date.now(),
          });
          return;
        }

        // 5. Speaker Status: Guardian started/stopped listening to user live voice
        if (msg.type === "speaker_status") {
          broadcastToUser(msg.userPhone, {
            type: "guardian_speaker_status",
            guardianPhone: msg.guardianPhone,
            isListening: Boolean(msg.isListening),
          });
          return;
        }

        // 6. WebRTC Signaling Relay for direct low-latency P2P
        if (msg.type === "webrtc_signal") {
          if (msg.targetRole === "user") {
            broadcastToUser(msg.targetPhone, {
              type: "webrtc_signal",
              fromPhone: msg.fromPhone,
              signal: msg.signal,
            });
          } else {
            broadcastToGuardians(msg.targetPhone, {
              type: "webrtc_signal",
              fromPhone: msg.fromPhone,
              signal: msg.signal,
            });
          }
          return;
        }

        // 7. Bidirectional Permission Event Relay over WebSocket
        if (msg.type === "permission_update") {
          if (msg.userPhone && msg.permissions) {
            permissionsStore[msg.userPhone] = {
              ...(permissionsStore[msg.userPhone] || {}),
              ...msg.permissions,
              updatedAt: new Date().toISOString(),
              updatedBy: msg.updatedBy || 'user',
            };
            broadcastToGuardians(msg.userPhone, {
              type: "guardian_permission_updated",
              userPhone: msg.userPhone,
              permissions: permissionsStore[msg.userPhone],
            });
            broadcastToUser(msg.userPhone, {
              type: "guardian_permission_updated",
              userPhone: msg.userPhone,
              permissions: permissionsStore[msg.userPhone],
            });
          }
          return;
        }

        if (msg.type === "permission_request") {
          if (msg.userPhone && msg.requestedPermissions) {
            const cur = permissionsStore[msg.userPhone] || {
              camera: false,
              microphone: false,
              location: false,
              updatedAt: new Date().toISOString(),
              updatedBy: 'user',
            };
            cur.requests = {
              ...(cur.requests || {}),
              ...msg.requestedPermissions,
              guardianPhone: msg.guardianPhone,
              guardianName: msg.guardianName,
              requestedAt: new Date().toISOString(),
            };
            permissionsStore[msg.userPhone] = cur;
            broadcastToUser(msg.userPhone, {
              type: "guardian_access_requested",
              userPhone: msg.userPhone,
              guardianPhone: msg.guardianPhone,
              guardianName: msg.guardianName || "Guardian",
              requests: cur.requests,
              timestamp: Date.now(),
            });
          }
          return;
        }
      } catch (err) {
        console.warn("WebSocket message parsing error:", err);
      }
    });

    ws.on("close", () => {
      if (currentClient) {
        liveClients.delete(currentClient);
        if (currentClient.role === "user") {
          broadcastToGuardians(currentClient.phone, {
            type: "user_live_status",
            userPhone: currentClient.phone,
            isOnline: false,
          });
        }
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server and Live Communication WebSocket running on http://localhost:${PORT}`);
  });
}

startServer();
