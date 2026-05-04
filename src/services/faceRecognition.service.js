/* global Blob, FormData, fetch */

const { FaceEmbedding, Student, StudentAccessLog } = require('../models');
const AppError = require('../utils/AppError');
const { uploadBase64Image } = require('../config/cloudinary');
const { getFaceServiceAuthHeaders } = require('./internalAuth.service');
const { faceServiceUrl } = require('../utils/faceServiceUrl');

// ---------------------------------------------------------------------------
// In-memory embedding cache for fast cosine similarity matching
// ---------------------------------------------------------------------------

let embeddingCache = []; // [{ studentId, studentCode, fullName, embedding: number[] }]
let cacheLoaded = false;
let cacheLoadPromise = null; // Prevents concurrent cache reloads

// ---------------------------------------------------------------------------
// Deduplication: prevent duplicate access logs from rapid frame processing.
// Maps "studentId:logType" → timestamp of last log creation.
// ---------------------------------------------------------------------------
const LOG_DEDUP_WINDOW_MS = 5_000; // 5-second burst lock (race-condition guard only)
const recentLogTimestamps = new Map(); // key: "studentId:check_in" → Date.now()

// Unknown face tracking: grace period before logging strangers.
// Gives recognition time to match across multiple frames before declaring "unknown".
const UNKNOWN_GRACE_PERIOD_MS = 5_000; // 5s grace period
const pendingUnknowns = new Map(); // camera_id → { firstSeen: number, frame_base64: string }
const unknownCooldowns = new Map(); // camera_id → timestamp of last unknown log created

const loadEmbeddingCache = async () => {
  // If a load is already in progress, wait for it instead of starting another
  if (cacheLoadPromise) return cacheLoadPromise;

  cacheLoadPromise = (async () => {
    try {
      const embeddings = await FaceEmbedding.find({ is_active: true })
        .populate('student', 'student_code full_name avatar_url')
        .lean();

      embeddingCache = embeddings
        .filter((e) => e.student) // Skip orphaned embeddings (deleted students)
        .map((e) => ({
          studentId: e.student._id.toString(),
          studentCode: e.student.student_code,
          fullName: e.student.full_name,
          avatarUrl: e.student.avatar_url,
          embedding: e.embedding,
        }));
      cacheLoaded = true;
    } finally {
      cacheLoadPromise = null;
    }
  })();

  return cacheLoadPromise;
};

const cosineSimilarity = (a, b) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 512; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const findBestMatch = (queryEmbedding, threshold = 0.6) => {
  let bestScore = -1;
  let bestEntry = null;
  for (const entry of embeddingCache) {
    const score = cosineSimilarity(queryEmbedding, entry.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  if (bestScore >= threshold && bestEntry) {
    return {
      studentId: bestEntry.studentId,
      studentCode: bestEntry.studentCode,
      fullName: bestEntry.fullName,
      avatarUrl: bestEntry.avatarUrl,
      confidence: bestScore,
    };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

const registerFace = async (studentId, imageBuffer, registeredBy) => {
  // Verify student exists
  const student = await Student.findById(studentId);
  if (!student) {
    throw new AppError('Student not found', 404);
  }

  // Call FaceService to detect + embed
  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'face.jpg');

  const response = await fetch(faceServiceUrl('/register'), {
    method: 'POST',
    headers: {
      ...getFaceServiceAuthHeaders(),
    },
    body: form,
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new AppError(result.detail || 'Face detection failed', response.status);
  }

  // Upsert face embedding
  const faceData = {
    student: studentId,
    embedding: result.embedding,
    face_image_url: result.face_crop_base64
      ? `data:image/jpeg;base64,${result.face_crop_base64}`
      : null,
    registered_by: registeredBy,
    is_active: true,
    quality_score: result.quality_score,
  };

  const faceEmbedding = await FaceEmbedding.findOneAndUpdate({ student: studentId }, faceData, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  // Refresh cache
  await loadEmbeddingCache();

  return {
    id: faceEmbedding._id,
    studentId: student._id,
    studentCode: student.student_code,
    fullName: student.full_name,
    qualityScore: result.quality_score,
    faceImageUrl: faceData.face_image_url,
    registeredAt: faceEmbedding.createdAt,
  };
};

const removeFace = async (studentId) => {
  const result = await FaceEmbedding.findOneAndDelete({ student: studentId });
  if (!result) {
    throw new AppError('No face registration found for this student', 404);
  }
  await loadEmbeddingCache();
  return { message: 'Face registration removed' };
};

const getRegisteredStudents = async () => {
  const embeddings = await FaceEmbedding.find({ is_active: true })
    .populate('student', 'student_code full_name avatar_url')
    .populate('registered_by', 'email fullname')
    .sort({ createdAt: -1 })
    .lean();

  return embeddings
    .filter((e) => e.student) // Skip orphaned embeddings
    .map((e) => ({
      id: e._id,
      studentId: e.student._id,
      studentCode: e.student.student_code,
      fullName: e.student.full_name,
      avatarUrl: e.student.avatar_url,
      faceImageUrl: e.face_image_url,
      qualityScore: e.quality_score,
      registeredBy: e.registered_by?.email || e.registered_by?.fullname,
      registeredAt: e.createdAt,
    }));
};

const getStudentFaceDetail = async (studentId) => {
  const embedding = await FaceEmbedding.findOne({ student: studentId })
    .populate('student', 'student_code full_name avatar_url')
    .populate('registered_by', 'email fullname')
    .lean();

  if (!embedding) {
    throw new AppError('No face registration found for this student', 404);
  }
  if (!embedding.student) {
    throw new AppError('Student record has been deleted', 404);
  }

  return {
    id: embedding._id,
    studentId: embedding.student._id,
    studentCode: embedding.student.student_code,
    fullName: embedding.student.full_name,
    avatarUrl: embedding.student.avatar_url,
    faceImageUrl: embedding.face_image_url,
    qualityScore: embedding.quality_score,
    isActive: embedding.is_active,
    registeredBy: embedding.registered_by?.email || embedding.registered_by?.fullname,
    registeredAt: embedding.createdAt,
  };
};

/**
 * Handle detection callback from FaceService.
 * Matches embeddings, creates access logs, returns enriched detections.
 */
const handleDetectionCallback = async (payload, io = null) => {
  if (!cacheLoaded) {
    await loadEmbeddingCache();
  }

  const { camera_id, camera_type, timestamp, detections, frame_base64 } = payload || {};

  // Validate required fields
  if (!camera_id || typeof camera_id !== 'string') {
    throw new AppError('callback payload: camera_id is required', 400);
  }
  if (!camera_type || !['checkin', 'checkout'].includes(camera_type)) {
    throw new AppError('callback payload: camera_type must be "checkin" or "checkout"', 400);
  }
  if (!Array.isArray(detections)) {
    throw new AppError('callback payload: detections must be an array', 400);
  }

  // Determine check-in or check-out based on camera type
  const logType = camera_type === 'checkout' ? 'check_out' : 'check_in';

  const enrichedDetections = [];
  const matchedLogIds = [];

  for (const det of detections) {
    if (!det || !Array.isArray(det.embedding) || det.embedding.length !== 512) {
      continue; // Skip malformed detections
    }
    const match = findBestMatch(det.embedding);

    const enriched = {
      bbox: det.bbox,
      det_score: det.det_score,
      student_id: match?.studentId || null,
      student_name: match?.fullName || null,
      student_code: match?.studentCode || null,
      avatar_url: match?.avatarUrl || null,
      confidence: match?.confidence || null,
      is_match: !!match,
      access_log_id: null,
    };

    // Auto-create access log for matched faces (with state-based dedup)
    if (match) {
      const dedupKey = `${match.studentId}:${logType}`;
      const lastLogged = recentLogTimestamps.get(dedupKey) || 0;
      const now = Date.now();

      // Burst lock: prevents race conditions from rapid frames
      if (now - lastLogged <= LOG_DEDUP_WINDOW_MS) {
        enriched.status_unchanged = true;
        enrichedDetections.push(enriched);
        continue;
      }

      // State check: if student's last log is the same type, don't create a new one
      const latestLog = await StudentAccessLog.findOne({ student: match.studentId })
        .sort({ createdAt: -1 })
        .select('type')
        .lean();

      if (latestLog && latestLog.type === logType) {
        // Already in this state — no new log, just flag for UI feedback
        enriched.status_unchanged = true;
      } else {
        recentLogTimestamps.set(dedupKey, now);
        const log = await StudentAccessLog.create({
          student: match.studentId,
          type: logType,
          method: 'face_recognition',
          camera_id,
          confidence: match.confidence,
        });
        enriched.access_log_id = log._id.toString();
        matchedLogIds.push(log._id);

        // Upload annotated frame to Cloudinary (non-blocking)
        if (frame_base64) {
          const logId = log._id;
          const logIdStr = log._id.toString();
          uploadBase64Image(frame_base64, {
            public_id: `${logType}_${match.studentCode}_${Date.now()}`,
          })
            .then((url) => {
              StudentAccessLog.findByIdAndUpdate(logId, { face_snapshot_url: url }).catch(() => {});
              // Notify clients the snapshot URL is now available
              if (io) {
                io.to('security_cameras').emit('access_log_updated', {
                  _id: logIdStr,
                  face_snapshot_url: url,
                });
              }
            })
            .catch((err) => {
              console.error('[Cloudinary] Snapshot upload failed:', err.message);
            });
        }
      }
    }

    enrichedDetections.push(enriched);
  }

  // Populate matched logs for socket emission
  const matchedLogs =
    matchedLogIds.length > 0
      ? await StudentAccessLog.find({ _id: { $in: matchedLogIds } })
          .populate('student', 'student_code full_name avatar_url')
          .lean()
      : [];

  // Unknown face tracking with grace period
  let unknownLog = null;
  const hasAnyMatch = enrichedDetections.some((d) => d.is_match);
  const hasUnmatched = enrichedDetections.some((d) => !d.is_match);

  if (hasAnyMatch) {
    // A face was recognized — cancel any pending unknown for this camera
    // (the "unknown" was likely the same person before recognition kicked in)
    pendingUnknowns.delete(camera_id);
  }

  if (hasUnmatched && !hasAnyMatch) {
    const lastCooldown = unknownCooldowns.get(camera_id) || 0;
    if (Date.now() - lastCooldown > LOG_DEDUP_WINDOW_MS) {
      if (!pendingUnknowns.has(camera_id)) {
        // First time seeing unmatched face — start grace period
        pendingUnknowns.set(camera_id, { firstSeen: Date.now(), frame_base64 });
      } else {
        const pending = pendingUnknowns.get(camera_id);
        pending.frame_base64 = frame_base64; // Keep latest frame for best quality

        if (Date.now() - pending.firstSeen >= UNKNOWN_GRACE_PERIOD_MS) {
          // Grace period elapsed, still no match — log as unknown
          pendingUnknowns.delete(camera_id);
          unknownCooldowns.set(camera_id, Date.now());

          const log = await StudentAccessLog.create({
            student: null,
            type: logType,
            method: 'face_recognition',
            camera_id,
            confidence: null,
          });

          // Non-blocking Cloudinary upload with the latest frame
          if (pending.frame_base64) {
            const logId = log._id;
            const logIdStr = log._id.toString();
            uploadBase64Image(pending.frame_base64, {
              public_id: `unknown_${camera_id}_${Date.now()}`,
            })
              .then((url) => {
                StudentAccessLog.findByIdAndUpdate(logId, { face_snapshot_url: url }).catch(
                  () => {}
                );
                if (io) {
                  io.to('security_cameras').emit('access_log_updated', {
                    _id: logIdStr,
                    face_snapshot_url: url,
                  });
                }
              })
              .catch((err) => {
                console.error('[Cloudinary] Unknown snapshot upload failed:', err.message);
              });
          }

          unknownLog = await StudentAccessLog.findById(log._id).lean();
        }
      }
    }
  } else if (!hasUnmatched) {
    // No unmatched faces in frame — clear pending (person left)
    pendingUnknowns.delete(camera_id);
  }

  return {
    camera_id,
    camera_type,
    timestamp,
    detections: enrichedDetections,
    frame_base64,
    matchedLogs,
    unknownLog,
  };
};

const getAllStudents = async () => {
  const students = await Student.find().select('student_code full_name avatar_url').lean();
  return students.map((s) => ({
    _id: s._id,
    student_code: s.student_code,
    full_name: s.full_name,
    avatar_url: s.avatar_url,
  }));
};

module.exports = {
  registerFace,
  removeFace,
  getRegisteredStudents,
  getStudentFaceDetail,
  handleDetectionCallback,
  loadEmbeddingCache,
  getAllStudents,
};
