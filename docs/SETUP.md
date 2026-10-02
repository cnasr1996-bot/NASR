# التركيب على جهاز البوث (Windows)

## 1. تثبيت السوفتوير

1. ثبّت **Node.js 22 LTS**.
2. انسخ المشروع ثم:
   ```bash
   npm install
   npm start
   ```
3. لبناء ملف تثبيت: `npm run dist` (يطلع ملف `.exe` في مجلد `dist/`).

## 2. كاميرا Canon (EDSDK)

الـ EDSDK من كانون **غير مسموح إعادة توزيعه**، فلازم كل جهة تسجّل وتحمّله بنفسها:

1. سجّل في **Canon Developer Programme** (للمنطقة: Canon Middle East / Europe) واطلب الـ **EDSDK for Windows**.
2. حمّل مكتبة الربط وابنها مع الـ EDSDK (الخطوات في صفحة المكتبة
   [`@brick-a-brack/napi-canon-cameras`](https://www.npmjs.com/package/@brick-a-brack/napi-canon-cameras)):
   - فك الـ EDSDK داخل `third_party/` في مجلد المكتبة.
   - طابق رقم الإصدار في `binding.gyp`.
   - `npm run package` ثم في مشروعنا: `npm i path/to/napi-canon-cameras.tgz`
3. في `config/local.json`: `"camera": { "driver": "canon" }`.
4. على الكاميرا: Auto Power Off = Disable، وصل الكاميرا بالـ Dummy Battery، وصلها بـ USB مباشرة.

## 3. طابعة DNP

1. ثبّت تعريف Windows الرسمي من موقع DNP (DNP Imagingcomm / DNP Photo).
2. من **Printing Preferences** للطابعة اضبط الافتراضيات: المقاس **(6x4)**، الطبقة **Glossy** أو **Matte**، وأي إعداد قص.
3. اعرف اسم الطابعة بالضبط:
   ```powershell
   Get-Printer | Select Name
   ```
   وضعه في `config/local.json` → `printer.deviceName`، و`printer.driver` = `windows`.
4. اطبع تجربة وتأكد أن الصورة بدون حواف بيضاء (Borderless).
5. بعد كل تبديل رول: `Ctrl+Shift+M` لتصفير العدّاد.

## 4. وضع الكشك (Kiosk)

- أنشئ مستخدم Windows محلي خاص للبوث، وفعّل الدخول التلقائي.
- شغّل التطبيق تلقائياً عند الدخول (اختصار في `shell:startup`).
- **إعدادات الطاقة:** إيقاف النوم وإطفاء الشاشة، وإيقاف **USB selective suspend** (مهم جداً للكاميرا).
- أوقف تحديثات Windows التلقائية أثناء ساعات العمل، وأوقف الإشعارات (Focus Assist).
- الفيديو الترحيبي: ضع الملف في `src/renderer/assets/` واكتب مساره في `attract.video` (مثلاً `assets/attract.mp4`).

## 5. جهاز الدفع

بعد اختيار المزوّد واستلام وثائق الـ ECR، يُكتب درايفر جديد في `src/hardware/payment/` بنفس الواجهة:

```js
charge({ amount, currency, reference, timeoutMs }) // → { status: 'approved'|'declined'|'timeout'|'error', transactionId }
cancel()                                            // يلغي العملية المعلّقة على الجهاز
```

وبعدها `"payment": { "driver": "<اسم الدرايفر>" }` في `config/local.json`.
