# FRONTEND_REBUILD_PLAN.md

## الهدف

إعادة تنظيم واجهة BloodNet بطريقة نظيفة وقابلة للتطوير، مع الحفاظ على عمل Backend الحالي وعدم تعديل Docker أو قاعدة البيانات.

## النطاق الحالي

العمل في هذه المرحلة محصور داخل مجلد:

frontend/

ولا يتم تعديل:

- api-gateway
- donor-service
- request-service
- inventory-service
- notification-service
- multicast-node
- docker-compose.yml
- database/

## المشكلة الحالية

الواجهة الحالية تعمل، لكنها تعاني من:

- تراكم ملفات CSS.
- وجود أكثر من ملف Layout.
- خلط منطق API مع منطق العرض داخل app.js.
- صفحات مضافة ديناميكيًا داخل JavaScript بدل أن تكون منظمة.
- تداخل بين الهيدر والقائمة الجانبية.
- صعوبة تطوير صفحات جديدة بدون كسر التصميم.

## الصفحات المطلوبة في الواجهة

- لوحة التحكم
- المتبرعون
- طلبات الدم
- المستشفيات
- تبرعات الدم
- مخزون الدم
- تسليم الطلبات
- الإشعارات
- مسار النظام
- حالة الخدمات

## الشكل المعماري الجديد للواجهة

frontend/
  index.html
  assets/
  styles/
    tokens.css
    base.css
    layout.css
    components.css
    pages.css
  js/
    config.js
    api.js
    state.js
    router.js
    layout.js
    pages/
      dashboard.page.js
      donors.page.js
      requests.page.js
      hospitals.page.js
      donations.page.js
      inventory.page.js
      handovers.page.js
      notifications.page.js
      workflow.page.js
      health.page.js
    components/
      modal.js
      table.js
      cards.js
      badges.js

## قواعد التصميم

- الواجهة RTL.
- القائمة الجانبية في اليمين.
- الشعار يظهر داخل القائمة الجانبية فقط.
- الهيدر لا يحتوي على الشعار.
- حقل البحث داخل الهيدر بدون تداخل مع الأيقونات.
- ألوان التنقل تكون بدرجات الأحمر المناسبة لنظام BloodNet.
- الحفاظ على البطاقات والتصميم الجميل الموجود سابقًا.
- إزالة الملفات الزائدة بعد التأكد من نقل ما نحتاجه منها.

## قواعد التنفيذ

- لا تعديل عشوائي.
- كل تعديل يتم بعد نسخة احتياطية.
- كل ملف جديد له وظيفة واحدة واضحة.
- لا نجمع CSS كله في ملف واحد ضخم.
- لا نجمع كل JavaScript في app.js.
- لا نضيف صفحة جديدة قبل تثبيت Layout العام.

## ترتيب العمل

1. فحص الملفات المحملة فعليًا في index.html.
2. فحص أسماء الكلاسات الحقيقية.
3. تحديد CSS المستخدم والزائد.
4. إنشاء مجلد styles الجديد.
5. إنشاء مجلد js الجديد.
6. نقل إعدادات API إلى config.js.
7. نقل دوال الاتصال إلى api.js.
8. بناء layout.js للهيدر والقائمة الجانبية.
9. بناء router.js للتنقل بين الصفحات.
10. نقل كل صفحة إلى ملف مستقل.
11. اختبار كل صفحة.
12. حذف الملفات القديمة بعد التأكد.

## قرار مهم

Backend مكتمل ومجمد في هذه المرحلة. أي نقص في الواجهة يتم إصلاحه من Frontend فقط، إلا إذا ظهر لاحقًا أن endpoint غير موجود.
