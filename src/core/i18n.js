/**
 * UI strings in Arabic and English. Every key must exist in both languages
 * (enforced by test/i18n.test.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18N = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const strings = {
    ar: {
      dir: 'rtl',
      langToggle: 'English',
      attractTitle: 'ابتسم… لحظتك تستاهل تنطبع',
      attractSubtitle: 'المس الشاشة للبدء',
      captureHint: 'انظر إلى الكاميرا',
      getReady: 'استعد!',
      reviewTitle: 'كيف طلعت الصورة؟',
      retake: 'إعادة التصوير',
      retakesLeft: 'محاولات متبقية: {n}',
      looksGood: 'ممتازة، اطبعها',
      paymentTitle: 'الدفع',
      paymentAmount: '{amount} ريال',
      paymentInstruction: 'قرّب البطاقة أو الجوال من جهاز الدفع',
      paymentMethods: 'مدى · فيزا · ماستركارد · Apple Pay',
      cancel: 'إلغاء',
      paymentFailedTitle: 'لم تتم عملية الدفع',
      paymentFailed_declined: 'تم رفض العملية. جرّب بطاقة أخرى.',
      paymentFailed_timeout: 'انتهى وقت الدفع.',
      paymentFailed_cancelled: 'تم إلغاء الدفع.',
      paymentFailed_error: 'تعذّر الاتصال بجهاز الدفع.',
      tryAgain: 'حاول مرة أخرى',
      startOver: 'البداية',
      printingTitle: 'جاري الطباعة…',
      printingSubtitle: 'صورتك تجهز خلال ثوانٍ',
      thankYouTitle: 'شكراً لك!',
      thankYouSubtitle: 'استلم صورتك من فتحة الطابعة',
      outOfServiceTitle: 'الجهاز متوقف مؤقتاً',
      outOfServiceSubtitle: 'نعتذر، سنعود قريباً',
      errorTitle: 'حدث خطأ',
      error_camera: 'الكاميرا غير متصلة. يرجى مراجعة الموظف.',
      error_capture: 'تعذّر التقاط الصورة. حاول مرة أخرى.',
      error_print: 'تعذّرت الطباعة. يرجى مراجعة الموظف مع الرقم المرجعي: {ref}',
      idleWarning: 'هل ما زلت هنا؟',
    },
    en: {
      dir: 'ltr',
      langToggle: 'العربية',
      attractTitle: 'Smile… this moment deserves a print',
      attractSubtitle: 'Touch the screen to start',
      captureHint: 'Look at the camera',
      getReady: 'Get ready!',
      reviewTitle: 'How does it look?',
      retake: 'Retake',
      retakesLeft: 'Retakes left: {n}',
      looksGood: 'Love it, print it',
      paymentTitle: 'Payment',
      paymentAmount: 'SAR {amount}',
      paymentInstruction: 'Tap your card or phone on the payment terminal',
      paymentMethods: 'mada · Visa · Mastercard · Apple Pay',
      cancel: 'Cancel',
      paymentFailedTitle: 'Payment not completed',
      paymentFailed_declined: 'The payment was declined. Try another card.',
      paymentFailed_timeout: 'Payment timed out.',
      paymentFailed_cancelled: 'Payment cancelled.',
      paymentFailed_error: 'Could not reach the payment terminal.',
      tryAgain: 'Try again',
      startOver: 'Start over',
      printingTitle: 'Printing…',
      printingSubtitle: 'Your photo will be ready in a few seconds',
      thankYouTitle: 'Thank you!',
      thankYouSubtitle: 'Collect your photo from the printer slot',
      outOfServiceTitle: 'Temporarily out of service',
      outOfServiceSubtitle: 'Sorry, we will be back shortly',
      errorTitle: 'Something went wrong',
      error_camera: 'The camera is not connected. Please ask a staff member.',
      error_capture: 'Could not take the photo. Please try again.',
      error_print: 'Printing failed. Please show this reference to a staff member: {ref}',
      idleWarning: 'Are you still there?',
    },
  };

  function t(lang, key, vars) {
    const table = strings[lang] || strings.ar;
    let s = table[key];
    if (s === undefined) s = strings.en[key] !== undefined ? strings.en[key] : key;
    if (vars) {
      for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    }
    return s;
  }

  return { strings, t };
});
