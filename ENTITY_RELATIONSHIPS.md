# BEDMS Entity Relationships

Tai lieu nay duoc viet theo kieu de ban ve Entity Relationship Diagram thu cong, giong mau minh hoa: moi dong la `Entity A - Relationship - Entity B - Cardinality`.

## 1. Nhom nguoi dung

1. `Users` - `has profile` - `Students` : `1 - 0..1`
2. `Users` - `has profile` - `Staffs` : `1 - 0..1`
3. `Users` - `receives` - `Notifications` : `1 - N`
4. `Users` - `creates` - `VisitorRequests` : `1 - N`
5. `Users` - `reviews` - `VisitorRequests` : `1 - N`
6. `Users` - `checks in/out` - `VisitorCheckins` : `1 - N`
7. `Users` - `participates in` - `ChatConversations` : `1 - N`
8. `Users` - `sends` - `ChatMessages` : `1 - N`
9. `Users` - `reports` - `ViolationReports` : `1 - N`

## 2. Nhom cau truc ky tuc xa

10. `Dorms` - `contains` - `Blocks` : `1 - N`
11. `Blocks` - `contains` - `Rooms` : `1 - N`
12. `Rooms` - `contains` - `Beds` : `1 - N`

## 3. Nhom dat phong va hop dong

13. `Students` - `submits` - `BookingRequests` : `1 - N`
14. `Rooms` - `is requested in` - `BookingRequests` : `1 - N`
15. `Beds` - `is selected in` - `BookingRequests` : `1 - N`
16. `Invoices` - `is linked to` - `BookingRequests` : `1 - N`
17. `Staffs` - `reviews` - `BookingRequests` : `1 - N`

18. `Students` - `signs` - `Contracts` : `1 - N`
19. `Rooms` - `is assigned in` - `Contracts` : `1 - N`
20. `Beds` - `is assigned in` - `Contracts` : `1 - N`
21. `Staffs` - `creates` - `Contracts` : `1 - N`

22. `Contracts` - `has extension request` - `ContractExtensions` : `1 - N`
23. `Students` - `requests` - `ContractExtensions` : `1 - N`
24. `Staffs` - `reviews` - `ContractExtensions` : `1 - N`

25. `Students` - `requests` - `RoomTransferRequests` : `1 - N`
26. `Rooms` - `is current room in` - `RoomTransferRequests` : `1 - N`
27. `Rooms` - `is requested room in` - `RoomTransferRequests` : `1 - N`
28. `Staffs` - `reviews` - `RoomTransferRequests` : `1 - N`

## 4. Nhom hoa don va thanh toan

29. `Students` - `is billed by` - `Invoices` : `1 - N`
30. `Rooms` - `generates` - `Invoices` : `1 - N`
31. `Staffs` - `creates` - `Invoices` : `1 - N`
32. `Invoices` - `has` - `InvoiceLineItems` : `1 - N`
33. `Invoices` - `is paid by` - `Payments` : `1 - N`
34. `Students` - `makes` - `Payments` : `1 - N`
35. `Staffs` - `creates` - `PricingConfigs` : `1 - N`
36. `Rooms` - `has` - `UtilityReadings` : `1 - N`
37. `Staffs` - `records` - `UtilityReadings` : `1 - N`

## 5. Nhom trang thiet bi

38. `EquipmentCategories` - `groups` - `EquipmentTemplates` : `1 - N`
39. `EquipmentTemplates` - `is instantiated as` - `RoomEquipments` : `1 - N`
40. `Rooms` - `has` - `RoomEquipments` : `1 - N`
41. `EquipmentTemplates` - `is configured in` - `RoomTypeEquipmentConfigs` : `1 - N`
42. `RoomEquipments` - `has history` - `EquipmentHistories` : `1 - N`
43. `Rooms` - `appears as old room in` - `EquipmentHistories` : `1 - N`
44. `Rooms` - `appears as new room in` - `EquipmentHistories` : `1 - N`
45. `Staffs` - `performs` - `EquipmentHistories` : `1 - N`

## 6. Nhom kiem tra phong

46. `Rooms` - `is inspected in` - `RoomInspections` : `1 - N`
47. `Contracts` - `is referenced in` - `RoomInspections` : `1 - N`
48. `Staffs` - `inspects` - `RoomInspections` : `1 - N`
49. `RoomInspections` - `has detail` - `InspectionEquipmentDetails` : `1 - N`
50. `RoomEquipments` - `is inspected in` - `InspectionEquipmentDetails` : `1 - N`

## 7. Nhom vi pham va diem ren luyen

51. `Students` - `is reported in` - `ViolationReports` : `1 - N`
52. `Staffs` - `reviews` - `ViolationReports` : `1 - N`
53. `Students` - `receives` - `Penalties` : `1 - N`
54. `ViolationReports` - `results in` - `Penalties` : `1 - N`
55. `Staffs` - `issues` - `Penalties` : `1 - N`
56. `Students` - `has` - `BehavioralScoreHistories` : `1 - N`
57. `Staffs` - `creates` - `BehavioralScoreHistories` : `1 - N`

## 8. Nhom bao tri

58. `Students` - `submits` - `MaintenanceRequests` : `1 - N`
59. `Rooms` - `has` - `MaintenanceRequests` : `1 - N`
60. `RoomEquipments` - `is mentioned in` - `MaintenanceRequests` : `1 - N`
61. `Staffs` - `reviews` - `MaintenanceRequests` : `1 - N`
62. `MaintenanceRequests` - `has feedback` - `MaintenanceFeedbacks` : `1 - 0..1`
63. `Students` - `submits` - `MaintenanceFeedbacks` : `1 - N`

## 9. Nhom khach tham

64. `VisitorRequests` - `includes` - `Visitors` : `1 - N`
65. `VisitorRequests` - `has` - `VisitorCheckins` : `1 - N`
66. `Visitors` - `has` - `VisitorCheckins` : `1 - N`

## 10. Nhom thong bao, chat, tin tuc, cau hinh

67. `ChatConversations` - `contains` - `ChatMessages` : `1 - N`
68. `Staffs` - `creates` - `News` : `1 - N`
69. `Staffs` - `updates` - `SystemConfigs` : `1 - N`

## 11. Cac quan he logic nen ve them neu muon day du nghiep vu

Nhung quan he duoi day khong phai foreign key truc tiep trong MongoDB, nhung nen ve trong ERD nghiep vu neu ban muon so do de doc hon:

1. `Rooms` - `belongs to room type` - `RoomType` : `N - 1`
Ghi chu: hien tai `room_type` dang la `string`, chua co bang `RoomTypes` rieng.

2. `RoomType` - `has standard equipment` - `RoomTypeEquipmentConfigs` : `1 - N`
Ghi chu: ban co the tao them thuc the logic `RoomType` khi ve ERD cho de hieu.

3. `Students` - `lives in` - `Rooms` : `N - 1`
Ghi chu: quan he nay duoc xac dinh gian tiep thong qua `Contracts`.

4. `Students` - `occupies` - `Beds` : `N - 1`
Ghi chu: quan he nay duoc xac dinh gian tiep thong qua `Contracts`.

## 12. De xuat cach ve Chen ERD giong hinh mau

Neu ban ve theo kieu hinh mau, hay dat:

- Hinh chu nhat: `Users`, `Students`, `Staffs`, `Dorms`, `Blocks`, `Rooms`, `Beds`, `BookingRequests`, `Contracts`, `Invoices`, `Payments`, `RoomEquipments`, `MaintenanceRequests`, `VisitorRequests`, `ChatConversations`, `ChatMessages`, `Notifications`, `ViolationReports`, `Penalties`.
- Hinh thoi: ten quan he nhu `has`, `contains`, `submits`, `creates`, `reviews`, `makes`, `includes`, `contains`, `records`.
- Dan nhan luc luong ket hop:
  - `1` gan entity cha.
  - `N` gan entity con.
  - `0..1` voi cac quan he tuy chon nhu `MaintenanceRequests` - `MaintenanceFeedbacks`.

## 13. Nhom thuc the nen dua vao ERD rut gon de bao cao

Neu ban muon mot ERD vua dep vua de doc trong bao cao, nen uu tien 18 thuc the chinh:

1. `Users`
2. `Students`
3. `Staffs`
4. `Dorms`
5. `Blocks`
6. `Rooms`
7. `Beds`
8. `BookingRequests`
9. `Contracts`
10. `Invoices`
11. `Payments`
12. `RoomEquipments`
13. `MaintenanceRequests`
14. `VisitorRequests`
15. `Visitors`
16. `ChatConversations`
17. `ChatMessages`
18. `ViolationReports`

Sau do moi them cac bang chi tiet nhu `InvoiceLineItems`, `UtilityReadings`, `InspectionEquipmentDetails`, `BehavioralScoreHistories` neu giang vien yeu cau ve day du du lieu.
