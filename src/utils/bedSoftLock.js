// In-memory soft lock store for bed selection
// Map<bedId, { userId, expiresAt, timeout }>

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

const locks = new Map();

const unlockBed = (bedId, io) => {
  const lock = locks.get(String(bedId));
  if (!lock) return;
  clearTimeout(lock.timeout);
  locks.delete(String(bedId));
  if (io) io.emit('bed_soft_unlocked', { bedId: String(bedId) });
};

const unlockByUser = (userId, io) => {
  for (const [bedId, lock] of locks.entries()) {
    if (lock.userId === String(userId)) {
      unlockBed(bedId, io);
      break;
    }
  }
};

const lockBed = (bedId, userId, io) => {
  // Release any existing lock by this user first
  unlockByUser(userId, io);

  const timeout = setTimeout(() => {
    locks.delete(String(bedId));
    if (io) io.emit('bed_soft_unlocked', { bedId: String(bedId) });
  }, LOCK_TTL_MS);

  locks.set(String(bedId), {
    userId: String(userId),
    expiresAt: Date.now() + LOCK_TTL_MS,
    timeout,
  });

  if (io) io.emit('bed_soft_locked', { bedId: String(bedId) });
};

const isLockedByOther = (bedId, userId) => {
  const lock = locks.get(String(bedId));
  return lock ? lock.userId !== String(userId) : false;
};

const getAllLockedBedIds = () => [...locks.keys()];

module.exports = { lockBed, unlockBed, unlockByUser, isLockedByOther, getAllLockedBedIds };
