# Error taxonomy

Every failure in Talla has a stable code, an Arabic message, an English message, and a fix
action. Codes are cheap on day one and a migration afterwards, which is why this exists
before the code does.

Ingest rejections are the visible face of this. They are most of what a store owner ever
experiences of Talla's quality, so a rejection that says "invalid input" costs a customer.

---

## Rules

1. **A code is permanent.** Once shipped, its meaning never changes. Retire it, never
   repurpose it.
2. **Every user-facing error carries a fix action.** If you cannot say what the person
   should do next, the error is not finished.
3. **Arabic is written first**, then English. Both are product copy, not translations of a
   log line.
4. **No em-dashes** in any user-facing string.
5. **Never log buyer PII**, including inside error payloads.
6. Internal errors surface to users as one generic code with a reference ID. The detail
   goes to the trace, not to the screen.

## Shape

```json
{
  "code": "INGEST_BACK_PHOTO_MISSING",
  "http_status": 422,
  "user_message": { "ar": "...", "en": "..." },
  "fix_action": { "ar": "...", "en": "..." },
  "retryable": true,
  "trace_id": "..."
}
```

## Ingest, `INGEST_*`

The store owner sees these. Each one must be fixable by the owner without contacting
support.

| Code | الرسالة العربية | English message | الإجراء بالعربية | Fix action |
|---|---|---|---|---|
| `INGEST_BACK_PHOTO_MISSING` | صورة الخلف مفقودة. | The back photo is missing. | أضف صورة للخلف ثم ارفع الصور مرة أخرى. | Add a photo of the back and upload again. |
| `INGEST_ANGLE_MISSING` | صورة الزاوية الثلاثية مفقودة. | The three quarter angle is missing. | أضف صورة من الجانب بزاوية نصفية تقريبًا. | Add a photo taken from the side, turned about halfway. |
| `INGEST_TOO_DARK` | الصورة مظلمة جدًا لقراءة اللون. | The photo is too dark to read the color. | صوّر قرب نافذة أو زد الإضاءة ثم أعد التصوير. | Shoot near a window or turn on more light, then upload again. |
| `INGEST_BLURRY` | الصورة غير واضحة بما يكفي. | The photo is not sharp enough. | ثبّت الهاتف، اضغط للتركيز، ثم أعد التصوير. | Hold the phone steady, tap to focus, and shoot again. |
| `INGEST_BACKGROUND_BUSY` | الخلفية تحتوي على عناصر كثيرة. | The background has too much in it. | ضع القطعة على سطح سادة وأبعد كل العناصر من الإطار. | Lay the piece on a plain surface with nothing else in frame. |
| `INGEST_GARMENT_CROPPED` | جزء من القطعة خارج الإطار. | Part of the piece is outside the frame. | ابتعد قليلًا حتى تظهر القطعة كاملة ثم أعد التصوير. | Step back so the whole piece fits, then shoot again. |
| `INGEST_GRAY_CARD_MISSING` | بطاقة الرمادي غير موجودة في الصورة. | The gray card is not in the photo. | ضع بطاقة الرمادي بجانب القطعة في الإضاءة نفسها ثم أعد التصوير. | Put the gray card flat next to the piece and shoot again. |
| `INGEST_GRAY_CARD_UNREADABLE` | بطاقة الرمادي في الظل. | The gray card is in shadow. | انقل البطاقة إلى الإضاءة نفسها الموجودة على القطعة. | Move the card into the same light as the piece. |
| `INGEST_FILE_TOO_LARGE` | حجم الملف أكبر من المسموح. | The file is larger than we can accept. | أرسل الصورة مباشرة من ألبوم الكاميرا دون تعديلها. | Send the photo straight from the camera roll without editing it. |
| `INGEST_FORMAT_UNSUPPORTED` | لا يمكننا قراءة نوع هذا الملف. | We cannot read this file type. | أرسل صورة بصيغة JPEG أو PNG أو WebP. | Send a JPEG, PNG, or WebP photo. |
| `INGEST_FILE_REJECTED` | تعذر قراءة هذا الملف. | We could not read this file. | التقط الصورة مرة أخرى باستخدام كاميرا الهاتف. | Take the photo again with the phone camera. |
| `INGEST_NO_MATCHING_BLOCK` | لا نملك شكلًا مناسبًا لهذه القطعة بعد. | We do not have a shape for this piece yet. | أخبرنا عنها وارفع قطعة أخرى مؤقتًا. | Tell us about it and we will add it. Meanwhile, upload a different piece. |

`INGEST_FILE_REJECTED` is deliberately vague to the user and deliberately specific in the
trace. It covers content sniffing failures, pixel bombs, and polyglot files, and telling an
attacker which check caught them is free information.

## Understanding, `UNDERSTAND_*`

| Code | Meaning | Surfaces to |
|---|---|---|
| `UNDERSTAND_SEGMENTATION_FAILED` | Could not separate the garment from the background | Store owner, as a re-shoot request |
| `UNDERSTAND_LOW_CONFIDENCE` | Derived fields fall below threshold | Confirmation screen, with the low-confidence fields pre-opened |

`UNDERSTAND_LOW_CONFIDENCE` is not an error state in the interface. It changes the
confirmation screen from "check this" to "we are unsure about these two fields". It
therefore carries no banner copy, and in code it is an internal code with a note rather
than a user-facing one.

`UNDERSTAND_SEGMENTATION_FAILED` does reach the owner, so it carries copy like any
ingest rejection.

| Code | الرسالة العربية | English message | الإجراء بالعربية | Fix action |
|---|---|---|---|---|
| `UNDERSTAND_SEGMENTATION_FAILED` | تعذر فصل القطعة عن الخلفية. | We could not separate the piece from the background. | صوّر القطعة على سطح سادة بلون مختلف عنها ثم أعد الرفع. | Shoot the piece on a plain surface in a different color, then upload again. |

## Solver and assets, `SOLVE_*`, `ASSET_*`

These are internal. The store sees one status: the item is still processing, or it needs a
re-shoot.

| Code | Meaning |
|---|---|
| `SOLVE_NON_CONVERGENT` | Drape did not settle within the iteration budget |
| `SOLVE_SELF_INTERSECTION` | Output mesh has self-intersections beyond tolerance |
| `ASSET_OVER_BUDGET` | Packed output exceeds the size budget. Publish is blocked |
| `ASSET_LOD_GENERATION_FAILED` | LOD chain could not be produced |

`ASSET_OVER_BUDGET` blocks publication. It is a gate, not a warning. See spec 11.3.

## Commerce, `ORDER_*`, `STOCK_*`

`INGEST_INVALID_FILE` is returned by the isolated decoder for unsupported, malformed,
oversized or animated files. Arabic: "تعذر قراءة الصورة بأمان." English: "The image could
not be read safely." Recovery: upload a still JPEG, PNG or WebP under 12 MB and 16
megapixels. Decoder diagnostics never cross the worker boundary.

The buyer sees these, in Arabic, mid-purchase. They are the highest-stakes copy in the
product.

| Code | الرسالة العربية | English message | الإجراء بالعربية | Fix action |
|---|---|---|---|---|
| `STOCK_UNAVAILABLE` | هذا المقاس نفد للتو. | This size just sold out. | اختر مقاسًا آخر أو أزله وتابع. | Pick another size, or remove it and continue. |
| `STOCK_INSUFFICIENT` | لم يتبقَ سوى جزء مما اخترته. | Only some of what you picked is left. | حدّثنا الكميات. راجع السلة وتابع. | We have updated the amounts. Check the cart and continue. |
| `ORDER_PHONE_UNVERIFIED` | نحتاج إلى تأكيد رقمك أولًا. | We need to confirm your number first. | أدخل الرمز الذي أرسلناه إليك. | Enter the code we sent you. |
| `ORDER_INVALID_INPUT` | بيانات الطلب غير مكتملة أو غير صالحة. | The order details are incomplete or invalid. | راجع القطع والكميات وبيانات التوصيل. | Check the items, quantities and delivery details. |
| `ORDER_INVALID_STATE` | لا يمكن تغيير حالة الطلب بهذه الطريقة. | The order cannot move to that state. | راجع حالة الطلب الحالية وخطوة التوصيل. | Check the current order and delivery status. |
| `ORDER_IDEMPOTENCY_CONFLICT` | تغير الطلب بعد محاولة إرساله. | The order changed after it was submitted. | راجع الطلب السابق قبل إنشاء طلب جديد. | Check the previous order before creating a new one. |
| `ORDER_OTP_INVALID` | الرمز غير صحيح. | That code is not right. | راجع الرسالة وحاول مرة أخرى. | Check the message and try again. |
| `ORDER_OTP_EXPIRED` | انتهت صلاحية الرمز. | That code has expired. | اطلب رمزًا جديدًا. | Ask for a new code. |
| `ORDER_RATE_LIMITED` | حدثت محاولات كثيرة. | Too many attempts. | انتظر بضع دقائق ثم حاول مرة أخرى. | Wait a few minutes and try again. |
| `ORDER_TOTAL_MISMATCH` | تغيرت الأسعار أثناء التسوق. | Prices changed while you were shopping. | حدّثنا الإجمالي. راجعه ثم أكد الطلب. | We have updated the total. Check it and confirm. |

`ORDER_TOTAL_MISMATCH` is the user-facing half of a security control: the client never
sends a price, and the server recomputes at submission. When the recomputed total differs,
the buyer is shown the new total rather than being silently charged either one.

## Auth and tenancy, `AUTH_*`

| Code | Notes |
|---|---|
| `AUTH_OTP_INVALID` | Never reveals whether the number is registered |
| `AUTH_OTP_RATE_LIMITED` | Per phone and per IP |
| `AUTH_SESSION_EXPIRED` | Admin idle timeout |
| `AUTH_FORBIDDEN` | Generic. Never says which tenant owns the resource |

`AUTH_FORBIDDEN` and the absence of a "no such store" response are the same control: a
404 and a 403 that differ tell an attacker which tenants exist.

These reach a person, so they carry copy. `AUTH_OTP_INVALID` reads exactly like
`ORDER_OTP_INVALID` on purpose: the two must be indistinguishable, or the difference
tells an attacker whether the number is registered.

| Code | الرسالة العربية | English message | الإجراء بالعربية | Fix action |
|---|---|---|---|---|
| `AUTH_OTP_INVALID` | الرمز غير صحيح. | That code is not right. | راجع الرسالة وحاول مرة أخرى. | Check the message and try again. |
| `AUTH_OTP_RATE_LIMITED` | حدثت محاولات كثيرة. | Too many attempts. | انتظر بضع دقائق ثم حاول مرة أخرى. | Wait a few minutes and try again. |
| `AUTH_OTP_DELIVERY_FAILED` | تعذر إرسال رمز التأكيد الآن. | We could not send a verification code right now. | انتظر دقيقة ثم اطلب رمزاً جديداً. | Wait a minute, then ask for a new code. |
| `AUTH_SESSION_EXPIRED` | انتهت الجلسة بسبب عدم النشاط. | Your session ended after a period of inactivity. | سجّل الدخول مرة أخرى للمتابعة. | Sign in again to continue. |
| `AUTH_FORBIDDEN` | لا تملك صلاحية الوصول إلى هذه الصفحة. | You do not have access to this page. | ارجع إلى لوحة المتجر. | Go back to your store dashboard. |

## Internal, `INTERNAL_*`

One code, `INTERNAL_ERROR`, plus a trace ID. Everything else stays in the trace.

| Code | الرسالة العربية | English message | الإجراء بالعربية | Fix action |
|---|---|---|---|---|
| `INTERNAL_ERROR` | حدث خطأ لدينا. | Something went wrong on our side. | حاول مرة أخرى بعد قليل. إذا تكرر، أرسل لنا الرقم المرجعي. | Try again shortly. If it keeps happening, send us the reference number. |

---

## In code

`packages/errors` is this document's executable half: the same codes, the same copy, and
a `toWireError` that builds the shape above. The two are changed together, and tests
assert that every code named here exists there, that every user-facing code has copy in
both languages with a fix action, and that no user-facing string contains an em-dash.

An internal code never reaches a screen. `toWireError` collapses it to `INTERNAL_ERROR`
carrying the trace ID, which is rule 6 enforced rather than remembered.
