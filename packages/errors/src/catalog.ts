import type { ErrorEntry } from './types.ts';

/**
 * Every code in docs/architecture/error-taxonomy.md, in the same order. Arabic first in
 * every entry, and no em-dash anywhere a user can see one.
 */
const catalog = {
  INGEST_INVALID_FILE: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'تعذر قراءة الصورة بأمان.',
      en: 'The image could not be read safely.',
    },
    fixAction: {
      ar: 'ارفع صورة JPEG أو PNG أو WebP ثابتة، بحجم أقل من 12 ميجابايت و16 مليون بكسل.',
      en: 'Upload a still JPEG, PNG or WebP under 12 MB and 16 megapixels.',
    },
  },
  // Ingest. The store owner sees these, and each must be fixable without support.
  INGEST_BACK_PHOTO_MISSING: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: { ar: 'صورة الخلف مفقودة.', en: 'The back photo is missing.' },
    fixAction: {
      ar: 'أضف صورة للخلف ثم ارفع الصور مرة أخرى.',
      en: 'Add a photo of the back and upload again.',
    },
  },
  INGEST_ANGLE_MISSING: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'صورة الزاوية الثلاثية مفقودة.',
      en: 'The three quarter angle is missing.',
    },
    fixAction: {
      ar: 'أضف صورة من الجانب بزاوية نصفية تقريبًا.',
      en: 'Add a photo taken from the side, turned about halfway.',
    },
  },
  INGEST_TOO_DARK: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'الصورة مظلمة جدًا لقراءة اللون.',
      en: 'The photo is too dark to read the color.',
    },
    fixAction: {
      ar: 'صوّر قرب نافذة أو زد الإضاءة ثم أعد التصوير.',
      en: 'Shoot near a window or turn on more light, then upload again.',
    },
  },
  INGEST_BLURRY: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: { ar: 'الصورة غير واضحة بما يكفي.', en: 'The photo is not sharp enough.' },
    fixAction: {
      ar: 'ثبّت الهاتف، اضغط للتركيز، ثم أعد التصوير.',
      en: 'Hold the phone steady, tap to focus, and shoot again.',
    },
  },
  INGEST_BACKGROUND_BUSY: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'الخلفية تحتوي على عناصر كثيرة.',
      en: 'The background has too much in it.',
    },
    fixAction: {
      ar: 'ضع القطعة على سطح سادة وأبعد كل العناصر من الإطار.',
      en: 'Lay the piece on a plain surface with nothing else in frame.',
    },
  },
  INGEST_GARMENT_CROPPED: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'جزء من القطعة خارج الإطار.',
      en: 'Part of the piece is outside the frame.',
    },
    fixAction: {
      ar: 'ابتعد قليلًا حتى تظهر القطعة كاملة ثم أعد التصوير.',
      en: 'Step back so the whole piece fits, then shoot again.',
    },
  },
  INGEST_GRAY_CARD_MISSING: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'بطاقة الرمادي غير موجودة في الصورة.',
      en: 'The gray card is not in the photo.',
    },
    fixAction: {
      ar: 'ضع بطاقة الرمادي بجانب القطعة في الإضاءة نفسها ثم أعد التصوير.',
      en: 'Put the gray card flat next to the piece and shoot again.',
    },
  },
  INGEST_GRAY_CARD_UNREADABLE: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: { ar: 'بطاقة الرمادي في الظل.', en: 'The gray card is in shadow.' },
    fixAction: {
      ar: 'انقل البطاقة إلى الإضاءة نفسها الموجودة على القطعة.',
      en: 'Move the card into the same light as the piece.',
    },
  },
  INGEST_FILE_TOO_LARGE: {
    audience: 'store',
    httpStatus: 413,
    retryable: true,
    message: {
      ar: 'حجم الملف أكبر من المسموح.',
      en: 'The file is larger than we can accept.',
    },
    fixAction: {
      ar: 'أرسل الصورة مباشرة من ألبوم الكاميرا دون تعديلها.',
      en: 'Send the photo straight from the camera roll without editing it.',
    },
  },
  INGEST_FORMAT_UNSUPPORTED: {
    audience: 'store',
    httpStatus: 415,
    retryable: true,
    message: {
      ar: 'لا يمكننا قراءة نوع هذا الملف.',
      en: 'We cannot read this file type.',
    },
    fixAction: {
      ar: 'أرسل صورة بصيغة JPEG أو PNG أو WebP.',
      en: 'Send a JPEG, PNG, or WebP photo.',
    },
  },
  /**
   * Deliberately vague to the user and deliberately specific in the trace. It covers
   * content sniffing failures, pixel bombs, and polyglot files, and telling an attacker
   * which check caught them is free information.
   */
  INGEST_FILE_REJECTED: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: { ar: 'تعذر قراءة هذا الملف.', en: 'We could not read this file.' },
    fixAction: {
      ar: 'التقط الصورة مرة أخرى باستخدام كاميرا الهاتف.',
      en: 'Take the photo again with the phone camera.',
    },
  },
  INGEST_NO_MATCHING_BLOCK: {
    audience: 'store',
    httpStatus: 422,
    retryable: false,
    message: {
      ar: 'لا نملك شكلًا مناسبًا لهذه القطعة بعد.',
      en: 'We do not have a shape for this piece yet.',
    },
    fixAction: {
      ar: 'أخبرنا عنها وارفع قطعة أخرى مؤقتًا.',
      en: 'Tell us about it and we will add it. Meanwhile, upload a different piece.',
    },
  },

  // Understanding.
  UNDERSTAND_SEGMENTATION_FAILED: {
    audience: 'store',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'تعذر فصل القطعة عن الخلفية.',
      en: 'We could not separate the piece from the background.',
    },
    fixAction: {
      ar: 'صوّر القطعة على سطح سادة بلون مختلف عنها ثم أعد الرفع.',
      en: 'Shoot the piece on a plain surface in a different color, then upload again.',
    },
  },
  /**
   * Not an error state in the interface. It changes the confirmation screen from
   * "check this" to "we are unsure about these two fields", so it carries no banner
   * copy of its own.
   */
  UNDERSTAND_LOW_CONFIDENCE: {
    audience: 'internal',
    httpStatus: 200,
    retryable: false,
    note: 'Derived fields fall below threshold. Drives the confirmation screen, not an error surface.',
  },

  // Solver and assets. Internal. The store sees processing or a re-shoot request.
  SOLVE_NON_CONVERGENT: {
    audience: 'internal',
    httpStatus: 500,
    retryable: true,
    note: 'Drape did not settle within the iteration budget.',
  },
  SOLVE_SELF_INTERSECTION: {
    audience: 'internal',
    httpStatus: 500,
    retryable: false,
    note: 'Output mesh has self-intersections beyond tolerance.',
  },
  ASSET_OVER_BUDGET: {
    audience: 'internal',
    httpStatus: 500,
    retryable: false,
    note: 'Packed output exceeds the size budget. Publish is blocked. A gate, not a warning (spec 11.3).',
  },
  ASSET_LOD_GENERATION_FAILED: {
    audience: 'internal',
    httpStatus: 500,
    retryable: true,
    note: 'LOD chain could not be produced.',
  },

  // Commerce. The buyer reads these in Arabic, mid-purchase. Highest-stakes copy here.
  STOCK_UNAVAILABLE: {
    audience: 'buyer',
    httpStatus: 409,
    retryable: false,
    message: { ar: 'هذا المقاس نفد للتو.', en: 'This size just sold out.' },
    fixAction: {
      ar: 'اختر مقاسًا آخر أو أزله وتابع.',
      en: 'Pick another size, or remove it and continue.',
    },
  },
  STOCK_INSUFFICIENT: {
    audience: 'buyer',
    httpStatus: 409,
    retryable: false,
    message: {
      ar: 'لم يتبقَ سوى جزء مما اخترته.',
      en: 'Only some of what you picked is left.',
    },
    fixAction: {
      ar: 'حدّثنا الكميات. راجع السلة وتابع.',
      en: 'We have updated the amounts. Check the cart and continue.',
    },
  },
  ORDER_PHONE_UNVERIFIED: {
    audience: 'buyer',
    httpStatus: 401,
    retryable: true,
    message: {
      ar: 'نحتاج إلى تأكيد رقمك أولًا.',
      en: 'We need to confirm your number first.',
    },
    fixAction: { ar: 'أدخل الرمز الذي أرسلناه إليك.', en: 'Enter the code we sent you.' },
  },
  ORDER_INVALID_INPUT: {
    audience: 'buyer',
    httpStatus: 422,
    retryable: true,
    message: {
      ar: 'بيانات الطلب غير مكتملة أو غير صالحة.',
      en: 'The order details are incomplete or invalid.',
    },
    fixAction: {
      ar: 'راجع القطع والكميات وبيانات التوصيل.',
      en: 'Check the items, quantities and delivery details.',
    },
  },
  ORDER_INVALID_STATE: {
    audience: 'store',
    httpStatus: 409,
    retryable: false,
    message: {
      ar: 'لا يمكن تغيير حالة الطلب بهذه الطريقة.',
      en: 'The order cannot move to that state.',
    },
    fixAction: {
      ar: 'راجع حالة الطلب الحالية وخطوة التوصيل.',
      en: 'Check the current order and delivery status.',
    },
  },
  ORDER_IDEMPOTENCY_CONFLICT: {
    audience: 'buyer',
    httpStatus: 409,
    retryable: true,
    message: {
      ar: 'تغير الطلب بعد محاولة إرساله.',
      en: 'The order changed after it was submitted.',
    },
    fixAction: {
      ar: 'راجع الطلب السابق قبل إنشاء طلب جديد.',
      en: 'Check the previous order before creating a new one.',
    },
  },
  ORDER_OTP_INVALID: {
    audience: 'buyer',
    httpStatus: 401,
    retryable: true,
    message: { ar: 'الرمز غير صحيح.', en: 'That code is not right.' },
    fixAction: {
      ar: 'راجع الرسالة وحاول مرة أخرى.',
      en: 'Check the message and try again.',
    },
  },
  ORDER_OTP_EXPIRED: {
    audience: 'buyer',
    httpStatus: 401,
    retryable: true,
    message: { ar: 'انتهت صلاحية الرمز.', en: 'That code has expired.' },
    fixAction: { ar: 'اطلب رمزًا جديدًا.', en: 'Ask for a new code.' },
  },
  ORDER_RATE_LIMITED: {
    audience: 'buyer',
    httpStatus: 429,
    retryable: true,
    message: { ar: 'حدثت محاولات كثيرة.', en: 'Too many attempts.' },
    fixAction: {
      ar: 'انتظر بضع دقائق ثم حاول مرة أخرى.',
      en: 'Wait a few minutes and try again.',
    },
  },
  /**
   * The user-facing half of a security control: the client never sends a price and the
   * server recomputes at submission (spec 12.5). When the recomputed total differs, the
   * buyer is shown the new total rather than being silently charged either one.
   */
  ORDER_TOTAL_MISMATCH: {
    audience: 'buyer',
    httpStatus: 409,
    retryable: true,
    message: {
      ar: 'تغيرت الأسعار أثناء التسوق.',
      en: 'Prices changed while you were shopping.',
    },
    fixAction: {
      ar: 'حدّثنا الإجمالي. راجعه ثم أكد الطلب.',
      en: 'We have updated the total. Check it and confirm the order.',
    },
  },

  // Auth and tenancy. Never reveal whether a number is registered or which tenant owns
  // a resource: a 404 and a 403 that differ tell an attacker which tenants exist.
  AUTH_OTP_INVALID: {
    audience: 'buyer',
    httpStatus: 401,
    retryable: true,
    message: { ar: 'الرمز غير صحيح.', en: 'That code is not right.' },
    fixAction: {
      ar: 'راجع الرسالة وحاول مرة أخرى.',
      en: 'Check the message and try again.',
    },
  },
  AUTH_OTP_RATE_LIMITED: {
    audience: 'buyer',
    httpStatus: 429,
    retryable: true,
    message: { ar: 'حدثت محاولات كثيرة.', en: 'Too many attempts.' },
    fixAction: {
      ar: 'انتظر بضع دقائق ثم حاول مرة أخرى.',
      en: 'Wait a few minutes and try again.',
    },
  },
  AUTH_OTP_DELIVERY_FAILED: {
    audience: 'buyer',
    httpStatus: 503,
    retryable: true,
    message: {
      ar: 'تعذر إرسال رمز التأكيد الآن.',
      en: 'We could not send a verification code right now.',
    },
    fixAction: {
      ar: 'انتظر دقيقة ثم اطلب رمزاً جديداً.',
      en: 'Wait a minute, then ask for a new code.',
    },
  },
  AUTH_SESSION_EXPIRED: {
    audience: 'store',
    httpStatus: 401,
    retryable: true,
    message: {
      ar: 'انتهت الجلسة بسبب عدم النشاط.',
      en: 'Your session ended after a period of inactivity.',
    },
    fixAction: { ar: 'سجّل الدخول مرة أخرى للمتابعة.', en: 'Sign in again to continue.' },
  },
  AUTH_FORBIDDEN: {
    audience: 'store',
    httpStatus: 403,
    retryable: false,
    message: {
      ar: 'لا تملك صلاحية الوصول إلى هذه الصفحة.',
      en: 'You do not have access to this page.',
    },
    fixAction: { ar: 'ارجع إلى لوحة المتجر.', en: 'Go back to your store dashboard.' },
  },

  // Internal. One code, plus a trace ID. Everything else stays in the trace.
  INTERNAL_ERROR: {
    audience: 'buyer',
    httpStatus: 500,
    retryable: true,
    message: { ar: 'حدث خطأ لدينا.', en: 'Something went wrong on our side.' },
    fixAction: {
      ar: 'حاول مرة أخرى بعد قليل. إذا تكرر، أرسل لنا الرقم المرجعي.',
      en: 'Try again shortly. If it keeps happening, send us the reference number.',
    },
  },
} as const satisfies Record<string, ErrorEntry>;

export type ErrorCode = keyof typeof catalog;

/**
 * The same table, widened to ErrorEntry. `as const` above keeps the code names exact;
 * reading through this view keeps every entry the same shape, so a caller does not have
 * to narrow a thirty-way union to ask whether there is copy.
 */
export const errorCatalog: Readonly<Record<ErrorCode, ErrorEntry>> = catalog;
