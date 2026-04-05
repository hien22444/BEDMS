# Use Cases - DMS (Dormitory Management System)

## UC1: Sign in via Google

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to sign in to the DMS system using my Google account |
| **Pre-Condition** | User has a valid Google account, and the system is connected to Google's authentication service. |
| **Actor** | Student/Staff/Manager |
| **Main Flow** | 1. User clicks "Sign in with Google" button<br>2. System redirects to Google OAuth login page<br>3. User enters Google credentials<br>4. System verifies credentials and creates session<br>5. User is redirected to dashboard |
| **Post-Condition** | User is logged into the system and can access assigned features |

---

## UC2: Logout

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to logout from the DMS system |
| **Pre-Condition** | User is currently logged into the system |
| **Actor** | Student/Staff/Manager |
| **Main Flow** | 1. User clicks "Logout" button<br>2. System terminates user session<br>3. User is redirected to login page |
| **Post-Condition** | User session is cleared and system returns to initial login state |

---

## UC3: View Notification List

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to view my list of notifications from the system |
| **Pre-Condition** | User is logged into the system and has notifications in the system |
| **Actor** | Student/Staff/Manager |
| **Main Flow** | 1. User navigates to Notification section<br>2. System retrieves and displays list of notifications<br>3. User can see notification title, description, and timestamp<br>4. User can mark notifications as read |
| **Post-Condition** | Notification list is displayed to the user |

---

## UC4: View News

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to view all news articles related to the dormitory |
| **Pre-Condition** | User is logged into the system. News articles exist in the system |
| **Actor** | Student/Staff/Manager |
| **Main Flow** | 1. User navigates to News section<br>2. System fetches and displays list of news articles<br>3. User can see news title, thumbnail, publication date<br>4. User can search or filter news by category/date |
| **Post-Condition** | News list is displayed with all available articles |

---

## UC5: View News Details

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to view detailed content of a specific news article |
| **Pre-Condition** | User is logged into the system and at least one news article exists |
| **Actor** | Student/Staff/Manager |
| **Main Flow** | 1. User clicks on a news article from the news list<br>2. System loads and displays full article content<br>3. User can see title, content, images, author, and publication date<br>4. User can navigate back to news list |
| **Post-Condition** | Full news article details are displayed to user |

---

## UC6: Booking

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to create a bed booking request in the dormitory |
| **Pre-Condition** | Student is logged in, available beds exist, and student is eligible to make a booking (no conflicting bookings, valid status) |
| **Actor** | Student |
| **Main Flow** | 1. Student navigates to Booking section<br>2. System displays available beds and dormitories<br>3. Student selects desired bed and check-in/check-out dates<br>4. Student reviews booking details<br>5. Student submits booking request<br>6. System creates booking record |
| **Post-Condition** | Booking request is created and student receives confirmation |

---

## UC7: Make Online Payment

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to make an online payment for dormitory fees or services |
| **Pre-Condition** | Student is logged in and has pending invoices or fees to pay. Payment gateway is operational |
| **Actor** | Student |
| **Main Flow** | 1. Student navigates to Payment section<br>2. System displays pending invoices<br>3. Student selects invoice(s) to pay<br>4. Student chooses payment method (card, e-wallet, bank transfer)<br>5. Student completes payment transaction<br>6. System processes payment and updates invoice status |
| **Post-Condition** | Payment is recorded and student receives payment confirmation receipt |

---

## UC8: View Booking History

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view my past and current bed booking history |
| **Pre-Condition** | Student is logged in and has at least one previous booking record |
| **Actor** | Student |
| **Main Flow** | 1. Student navigates to Booking History section<br>2. System retrieves all bookings associated with the student<br>3. System displays list with booking dates, bed info, status, and charges<br>4. Student can filter by date range or status<br>5. Student can click on booking for detailed information |
| **Post-Condition** | Booking history list is displayed to student |

---

## UC9: View Roommate

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view information about my current roommates |
| **Pre-Condition** | Student is logged in and is currently assigned to a bed/room with other students |
| **Actor** | Student |
| **Main Flow** | 1. Student navigates to Roommate section<br>2. System retrieves list of students in the same room<br>3. System displays roommate information (name, student ID, contact, status)<br>4. Student can view roommate profile/details<br>5. Student may be able to initiate chat with roommates |
| **Post-Condition** | Roommate list and information are displayed to student |

---

## UC10: View Electricity & Water Usage

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view my electricity and water consumption usage for the current billing period |
| **Pre-Condition** | Student is logged in and has active utilities data recorded. System has imported utility meter readings |
| **Actor** | Student |
| **Main Flow** | 1. Student navigates to Utilities/Usage section<br>2. System retrieves consumption data from utility meters<br>3. System displays current month usage (kWh for electricity, m³ for water)<br>4. System shows previous periods for comparison<br>5. Student can view breakdown by date or week<br>6. System displays estimated charges based on usage and rates |
| **Post-Condition** | Utility usage data and consumption breakdown are displayed to student |

---

## UC11: View Transaction History

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view my complete transaction history including all payments and charges |
| **Pre-Condition** | Student is logged in and has at least one transaction record in the system |
| **Actor** | Student |

---

## UC12: View Request History

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view all my submitted requests (maintenance, violation, checkout, etc.) and their current status |
| **Pre-Condition** | Student is logged in and has submitted at least one request to the system |
| **Actor** | Student |

---

## UC13: Register Visitor Information

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to register visitor information for guests coming to visit me in the dormitory |
| **Pre-Condition** | Student is logged in and dormitory allows visitor registration. Visitor registration feature is enabled |
| **Actor** | Student |

---

## UC14: Maintenance Request

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to submit a maintenance request for issues in my room (broken furniture, plumbing, electrical issues, etc.) |
| **Pre-Condition** | Student is logged in. There is an issue in the student's room or common area that requires maintenance |
| **Actor** | Student |

---

## UC15: Violation Request

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to report a violation of dormitory rules by another student |
| **Pre-Condition** | Student is logged in and has witnessed a violation of dormitory regulations |
| **Actor** | Student |

---

## UC16: Checkout Request

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to submit a checkout request to leave the dormitory |
| **Pre-Condition** | Student is logged in and currently has an active booking/assignment in the dormitory |
| **Actor** | Student |

---

## UC17: View CFD Score

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view my Behavioral/CFD (Conduct/Discipline) score in the dormitory |
| **Pre-Condition** | Student is logged in and CFD scoring system is active in the dormitory |
| **Actor** | Student |

---

## UC18: View Dormitory Regulations

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to view all dormitory rules and regulations |
| **Pre-Condition** | Student is logged in. Dormitory regulations are available in the system |
| **Actor** | Student/Staff/Manager |

---

## UC19: Chat with Manager

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to chat with the dormitory manager or staff for support and inquiries |
| **Pre-Condition** | Student is logged in and manager/support staff is available. Chat system is operational |
| **Actor** | Student |

---

## UC20: AI Assistant

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to interact with an AI assistant to get help and answers about dormitory-related questions |
| **Pre-Condition** | User is logged in. AI assistant service is enabled and configured |
| **Actor** | Student/Staff/Manager |

---

## UC21: View Bed/Usage Statistics

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view statistics about bed occupancy and usage in the dormitory |
| **Pre-Condition** | Manager is logged in. Booking and bed data exists in the system |
| **Actor** | Manager/Staff |

---

## UC22: View Bed List

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view a list of all beds in the dormitory with their current status and assignments |
| **Pre-Condition** | Manager is logged in. Beds have been created in the system |
| **Actor** | Manager/Staff |

---

## UC23: Update Status Bed

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to update the status of a bed (available, occupied, maintenance, blocked, etc.) |
| **Pre-Condition** | Manager is logged in and a bed exists in the system |
| **Actor** | Manager/Staff |

---

## UC24: Change Bed Assignment

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to change or reassign a student to a different bed in the dormitory |
| **Pre-Condition** | Manager is logged in. Student has an active bed assignment. Target bed is available |
| **Actor** | Manager/Staff |

---

## UC25: View Student Booking History List

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view the booking history of all students or a specific student |
| **Pre-Condition** | Manager is logged in. Student booking records exist in the system |
| **Actor** | Manager/Staff |

---

## UC26: Send Email

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to send emails to students regarding dormitory announcements or updates |
| **Pre-Condition** | Manager is logged in. Email service is configured and active |
| **Actor** | Manager/Staff |

---

## UC27: Register Student Face Image

| Attribute | Value |
|-----------|-------|
| **Description** | As a Student, I want to register/upload my face image for facial recognition check-in system |
| **Pre-Condition** | Student is logged in. Face recognition system is enabled. Camera access is available |
| **Actor** | Student |

---

## UC28: Create Checkout

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to create and process a checkout record for a student leaving the dormitory |
| **Pre-Condition** | Manager is logged in. Student has submitted a checkout request or is ready to checkout |
| **Actor** | Manager/Staff |

---

## UC29: Login as Student

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to login as a student account to view the system from a student's perspective |
| **Pre-Condition** | Manager is logged in with appropriate admin/impersonation permissions |
| **Actor** | Manager |

---

## UC30: Create Violation

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to create and record a violation report for a student who violated dormitory rules |
| **Pre-Condition** | Manager is logged in. A rule violation has occurred and needs to be recorded |
| **Actor** | Manager/Staff |

---

## UC31: View Request List

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view a list of all requests submitted by students (maintenance, violations, checkouts, etc.) |
| **Pre-Condition** | Manager is logged in. Student requests exist in the system |
| **Actor** | Manager/Staff |

---

## UC32: View Request Details

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view detailed information about a specific request submitted by a student |
| **Pre-Condition** | Manager is logged in and at least one request exists in the system |
| **Actor** | Manager/Staff |

---

## UC33: Update Request Status

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to update the status of a student request (pending, approved, rejected, completed, in-progress) |
| **Pre-Condition** | Manager is logged in and a request exists in the system that needs status update |
| **Actor** | Manager/Staff |

---

## UC34: Import Electric Water Data

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to import electricity and water consumption data from utility meters |
| **Pre-Condition** | Manager is logged in. Electricity and water meter data is available (CSV, Excel, or API connection) |
| **Actor** | Manager/Staff |

---

## UC35: Create Invoice

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to create invoices for students based on their room charges, utilities, and services |
| **Pre-Condition** | Manager is logged in. Student billing information and rates are configured in the system |
| **Actor** | Manager/Staff |

---

## UC36: View Invoice

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view invoices for students and track payment status |
| **Pre-Condition** | Manager is logged in. Invoices have been created in the system |
| **Actor** | Manager/Staff |

---

## UC37: Create News

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to create and publish news articles to inform students about dormitory updates and announcements |
| **Pre-Condition** | Manager is logged in. News management feature is enabled |
| **Actor** | Manager/Staff |

---

## UC38: View News

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view all created news articles in the system |
| **Pre-Condition** | Manager is logged in. News articles exist in the system |
| **Actor** | Manager/Staff |

---

## UC39: Update News

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to edit and update existing news articles |
| **Pre-Condition** | Manager is logged in and at least one news article exists in the system |
| **Actor** | Manager/Staff |

---

## UC40: Delete News

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to delete a news article from the system |
| **Pre-Condition** | Manager is logged in and at least one news article exists in the system |
| **Actor** | Manager/Staff |

---

## UC41: Chat with Student

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to chat with students to provide support and handle inquiries |
| **Pre-Condition** | Manager is logged in and chat system is operational. Student has initiated a chat or is available |
| **Actor** | Manager/Staff |

---

## UC42: Search/Filter

| Attribute | Value |
|-----------|-------|
| **Description** | As a User, I want to search and filter data in various sections (beds, students, bookings, requests, etc.) to find specific information |
| **Pre-Condition** | User is logged in. Data exists in the system that can be searched or filtered |
| **Actor** | Student/Staff/Manager |

---

## UC43: Update Date Config

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to configure important dates for the dormitory (check-in/checkout dates, semester start/end, registration periods) |
| **Pre-Condition** | Manager is logged in. Date configuration feature is accessible |
| **Actor** | Manager |

---

## UC44: Export Data

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to export dormitory data (students, bookings, transactions, etc.) to external formats (CSV, Excel, PDF) |
| **Pre-Condition** | Manager is logged in. Data exists in the system to be exported |
| **Actor** | Manager |

---

## UC45: View Camera Check-in

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view footage or records from dormitory entrance cameras for check-in monitoring |
| **Pre-Condition** | Manager is logged in. Camera system is installed and recording. Video data exists |
| **Actor** | Manager/Staff |

---

## UC46: View Visitor Information

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view visitor information including registration details and check-in/check-out records |
| **Pre-Condition** | Manager is logged in. Visitor records exist in the system |
| **Actor** | Manager/Staff |

---

## UC47: Record Check-in/out

| Attribute | Value |
|-----------|-------|
| **Description** | As a Staff/Manager, I want to record or verify student check-in and check-out times at the dormitory entrance |
| **Pre-Condition** | Staff/Manager is logged in. Student is present at dormitory entrance. Face recognition or manual verification system is available |
| **Actor** | Manager/Staff |

---

## UC48: Create Violation Request

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to create a violation request for tracking rule violations and disciplinary actions |
| **Pre-Condition** | Manager is logged in. A violation incident has been identified and needs to be recorded |
| **Actor** | Manager/Staff |

---

## UC49: Update Request Status

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to update the status of a student request (pending, approved, rejected, completed, in-progress) |
| **Pre-Condition** | Manager is logged in and a request exists in the system that needs status update |
| **Actor** | Manager/Staff |

---

## UC50: Receive Check-out Request

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to receive and process student checkout requests in a queue for approval or rejection |
| **Pre-Condition** | Manager is logged in. Students have submitted checkout requests in the system |
| **Actor** | Manager/Staff |

---

## UC51: View Statistics

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view comprehensive statistics and analytics about dormitory operations (occupancy, revenue, violations, requests) |
| **Pre-Condition** | Manager is logged in. Statistical data and reports are available in the system |
| **Actor** | Manager |

---

## UC52: Create Room Type

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to create different room types with specific configurations (single, double, dorm, VIP, etc.) |
| **Pre-Condition** | Manager is logged in. Room type management feature is enabled |
| **Actor** | Manager |

---

## UC53: View Room Type

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view all room types configured in the dormitory system with their specifications |
| **Pre-Condition** | Manager is logged in. Room types have been created in the system |
| **Actor** | Manager |

---

## UC54: Update Room Type

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to edit and update room type configurations (capacity, pricing, amenities, etc.) |
| **Pre-Condition** | Manager is logged in. At least one room type exists in the system |
| **Actor** | Manager |

---

## UC55: Delete Room Type

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to delete a room type from the system |
| **Pre-Condition** | Manager is logged in. Room type exists and is not currently in use by any rooms |
| **Actor** | Manager |

---

## UC56: Import User Account

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to import student or staff user accounts in bulk from a file (CSV, Excel) into the system |
| **Pre-Condition** | Manager is logged in. User account data file is available (CSV/Excel format with required fields) |
| **Actor** | Manager |

---

## UC57: View User List

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to view a list of all users in the system (students, staff, managers) with their details |
| **Pre-Condition** | Manager is logged in. User accounts exist in the system |
| **Actor** | Manager |

---

## UC58: Delete User

| Attribute | Value |
|-----------|-------|
| **Description** | As a Manager, I want to delete a user account from the system |
| **Pre-Condition** | Manager is logged in. User account exists and is not assigned to active resources |
| **Actor** | Manager |

---

## UC59: Create Dorm

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to create a new dormitory in the system with basic information |
| **Pre-Condition** | Admin, Manager is logged in. Dormitory management feature is enabled |
| **Actor** | Manager |

---

## UC60: View Dorm

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to view details of dormitories including location, capacity, blocks, and status |
| **Pre-Condition** | Admin, Manager is logged in. At least one dormitory exists in the system |
| **Actor** | Manager |

---

## UC61: Update Dorm

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to edit and update dormitory information and configurations |
| **Pre-Condition** | Admin, Manager is logged in. At least one dormitory exists in the system |
| **Actor** | Manager |

---

## UC62: Delete Dorm

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to delete a dormitory from the system |
| **Pre-Condition** | Admin, Manager is logged in. Dormitory exists and has no active bookings or assigned students |
| **Actor** | Manager |

---

## UC63: Create Block

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to create a new block (building/wing) within a dormitory |
| **Pre-Condition** | Admin, Manager is logged in. Dormitory exists and block management is enabled |
| **Actor** | Manager |

---

## UC64: View Block

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to view block information including rooms, capacity, and status |
| **Pre-Condition** | Admin, Manager is logged in. At least one block exists in the dormitory |
| **Actor** | Manager |

---

## UC65: Update Block

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to edit and update block information and configurations |
| **Pre-Condition** | Admin, Manager is logged in. At least one block exists in the system |
| **Actor** | Manager |

---

## UC66: Delete Block

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to delete a block from the dormitory system |
| **Pre-Condition** | Admin, Manager is logged in. Block exists and has no active rooms or students assigned |
| **Actor** | Manager |

---

## UC67: Create Room

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to create a new room in a block with specifications (room number, type, capacity, amenities) |
| **Pre-Condition** | Admin, Manager is logged in. Block exists and room management is enabled |
| **Actor** | Manager |

---

## UC68: View Room

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to view room details including occupants, status, beds, and assigned resources |
| **Pre-Condition** | Admin, Manager is logged in. At least one room exists in the system |
| **Actor** | Manager |

---

## UC69: Update Room/Status

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to edit room information and update room status (available, occupied, maintenance, closed) |
| **Pre-Condition** | Admin, Manager is logged in. At least one room exists in the system |
| **Actor** | Manager |

---

## UC70: Delete Room

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to delete a room from the system |
| **Pre-Condition** | Admin, Manager is logged in. Room exists and has no active bookings or students assigned |
| **Actor** | Manager |

---

## UC71: View Facility List

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to view a list of all facilities in the dormitory (common areas, equipment, amenities) |
| **Pre-Condition** | Admin, Manager is logged in. Facilities have been created in the system |
| **Actor** | Manager |

---

## UC72: Create Facility

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to create a new facility or amenity in the dormitory (gym, study room, kitchen, laundry, etc.) |
| **Pre-Condition** | Admin, Manager is logged in. Facility management feature is enabled |
| **Actor** | Manager |

---

## UC73: Update Facility

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to edit and update facility information and status |
| **Pre-Condition** | Admin, Manager is logged in. At least one facility exists in the system |
| **Actor** | Manager |

---

## UC74: Delete Facility

| Attribute | Value |
|-----------|-------|
| **Description** | As an Admin, Manager, I want to delete a facility from the dormitory system |
| **Pre-Condition** | Admin, Manager is logged in. Facility exists and is not currently in use |
| **Actor** | Manager |

---

