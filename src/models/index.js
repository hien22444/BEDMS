// User Management
module.exports.User = require('./user.model');
module.exports.Student = require('./student.model');
module.exports.Staff = require('./staff.model');

// Dormitory Management
module.exports.Dorm = require('./dorm.model');
module.exports.Block = require('./block.model');
module.exports.Room = require('./room.model');
module.exports.Bed = require('./bed.model');

// Equipment Management
module.exports.EquipmentCategory = require('./equipmentCategory.model');
module.exports.EquipmentTemplate = require('./equipmentTemplate.model');
module.exports.RoomEquipment = require('./roomEquipment.model');
module.exports.EquipmentHistory = require('./equipmentHistory.model');
module.exports.RoomTypeEquipmentConfig = require('./roomTypeEquipmentConfig.model');

// Booking & Contracts
module.exports.BookingRequest = require('./bookingRequest.model');
module.exports.Contract = require('./contract.model');
module.exports.RoomTransferRequest = require('./roomTransferRequest.model');
module.exports.ContractExtension = require('./contractExtension.model');

// Behavioral Scoring
module.exports.BehavioralScoreHistory = require('./behavioralScoreHistory.model');
module.exports.ViolationReport = require('./violationReport.model');
module.exports.Penalty = require('./penalty.model');

// Payment System
module.exports.PricingConfig = require('./pricingConfig.model');
module.exports.Invoice = require('./invoice.model');
module.exports.InvoiceLineItem = require('./invoiceLineItem.model');
module.exports.Payment = require('./payment.model');

// Visitor Management
module.exports.VisitorRequest = require('./visitorRequest.model');
module.exports.Visitor = require('./visitor.model');
module.exports.VisitorCheckin = require('./visitorCheckin.model');

// Maintenance Management
module.exports.MaintenanceRequest = require('./maintenanceRequest.model');
module.exports.MaintenanceFeedback = require('./maintenanceFeedback.model');
module.exports.OtherRequest = require('./otherRequest.model');

// Room Inspection
module.exports.RoomInspection = require('./roomInspection.model');
module.exports.InspectionEquipmentDetail = require('./inspectionEquipmentDetail.model');

// Notifications & Messaging
module.exports.Notification = require('./notification.model');
module.exports.ChatConversation = require('./chatConversation.model');
module.exports.ChatMessage = require('./chatMessage.model');

// News & Announcements
module.exports.News = require('./news.model');

// System Configuration
module.exports.SystemConfig = require('./systemConfig.model');

// Face Recognition & Camera
module.exports.FaceEmbedding = require('./faceEmbedding.model');
module.exports.StudentAccessLog = require('./studentAccessLog.model');
module.exports.CameraConfig = require('./cameraConfig.model');

// EW Usages (Electric/Water meter readings)
module.exports.EWUsage = require('./ewUsage.model');
