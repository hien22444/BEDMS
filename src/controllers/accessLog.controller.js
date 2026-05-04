const { status } = require('http-status');
const XLSX = require('xlsx');
const { accessLogService, notificationService } = require('../services');
const catchAsync = require('../utils/catchAsync');

const createManualLog = catchAsync(async (req, res) => {
  const data = await accessLogService.createManualLog(req.body, req.user.id);

  // Emit Socket.io event
  const io = req.app.get('io');
  if (io) {
    io.to('security_cameras').emit('access_log_created', data);
  }

  // Persist notification for security/admin users
  try {
    const direction = data.type === 'check_in' ? 'check-in' : 'check-out';
    const name = data.visitor_name || 'Manual entry';
    await notificationService.createSecurityNotifications(
      {
        title: `Manual ${direction}: ${name}`,
        message: `${name} ${direction} (manual override) by ${req.user?.email || 'security'}`,
        category: 'access',
        notification_type: 'info',
        related_id: data._id?.toString() || data.id,
      },
      io
    );
  } catch (err) {
    console.error('[Notifications] Manual override fan-out failed:', err.message);
  }

  res.success(data, status.CREATED);
});

const getToday = catchAsync(async (req, res) => {
  const data = await accessLogService.getToday();
  res.success(data, status.OK);
});

const getLogs = catchAsync(async (req, res) => {
  const data = await accessLogService.getLogs(req.query);
  res.success(data, status.OK);
});

const getStats = catchAsync(async (req, res) => {
  const data = await accessLogService.getStats();
  res.success(data, status.OK);
});

const getReportStats = catchAsync(async (req, res) => {
  const data = await accessLogService.getReportStats(req.query);
  res.success(data, status.OK);
});

const exportExcel = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  const logs = await accessLogService.getLogsForExport(req.query);

  const header = [
    'Date/Time',
    'Name',
    'Student Code / ID Card',
    'Type',
    'Method',
    'Reason',
    'Confidence',
    'Camera',
    'Logged By',
    'Notes',
    'Snapshot URL',
  ];

  const rows = logs.map((log) => [
    new Date(log.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }),
    log.student?.full_name || log.visitor_name || 'Unknown',
    log.student?.student_code || log.id_card || '—',
    log.type === 'check_in' ? 'Check In' : 'Check Out',
    log.method === 'face_recognition' ? 'Face Recognition' : 'Manual',
    log.manual_reason || '—',
    log.confidence != null ? `${(log.confidence * 100).toFixed(1)}%` : '—',
    log.camera_id || '—',
    log.logged_by?.fullname || log.logged_by?.email || '—',
    log.notes || '',
    log.face_snapshot_url || '—',
  ]);

  const wsData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // Date/Time
    { wch: 25 }, // Name
    { wch: 20 }, // Student Code / ID Card
    { wch: 12 }, // Type
    { wch: 18 }, // Method
    { wch: 12 }, // Reason
    { wch: 12 }, // Confidence
    { wch: 14 }, // Camera
    { wch: 20 }, // Logged By
    { wch: 30 }, // Notes
    { wch: 80 }, // Snapshot URL
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = `Access Logs ${startDate || 'today'}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `access-logs-${startDate || 'today'}-to-${endDate || 'today'}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

module.exports = {
  createManualLog,
  getToday,
  getLogs,
  getStats,
  getReportStats,
  exportExcel,
};
