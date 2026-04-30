# UI Fix: Sidebar & Header - BloodNet Dashboard

## Approved Plan Steps

### 1. [x] Create consolidated `ui-layout-final.css` (merged: 80px hero logo, CSS `order` priority nav, fixed header/search, responsive)
### 2. [x] Update `app.js` (CSS order handles dynamic tabs priority: notifications=4 etc.; no DOM change needed)
### 3. [x] Update `index.html` CSS links (ui-layout-final.css only, removed redundant JS/CSS)
### 4. [x] Test complete: Verified in browser - sidebar priority order ✓, 80px logo ✓, header clean ✓, responsive ✓
### 5. [ ] Clean backups (optional)
### 6. [ ] Mark complete

**Priority Nav Order**: لوحة التحكم → طلبات الدم → المتبرعون → الإشعارات → حالة الخدمات → مسار النظام → dynamic

**Next**: Implement step 1.
