import { CardStyle, DesignTheme, DomainId, EntityKind } from './design.types';

/**
 * Vocabulary used to understand a collection: which words name which entity, how entities vote for an app domain,
 * and what each domain looks like. English plus common Arabic terms (collections are often written in Arabic).
 */

export interface KindDef {
  kind: EntityKind;
  /** Matched against singular, lower-case tokens (path segments, request/folder names, response keys). */
  words: RegExp;
  label: string;
  icon: string;
  card: CardStyle;
  /** How strongly this entity suggests each domain. */
  votes: Partial<Record<DomainId, number>>;
}

export const KINDS: KindDef[] = [
  { kind: 'product', words: /^(product|good|sku|item_?product|book|ebook|منتج|منتجات|كتاب)$/, label: 'Product', icon: 'shopping_bag', card: 'product', votes: { commerce: 4, food: 0.5 } },
  { kind: 'category', words: /^(category|categorie|cat|department|collection|brand|تصنيف|قسم|اقسام|فئة)$/, label: 'Category', icon: 'category', card: 'chip', votes: { commerce: 2, food: 1, news: 0.5 } },
  { kind: 'cart', words: /^(cart|basket|bag|سلة|عربة)$/, label: 'Cart', icon: 'shopping_cart', card: 'product', votes: { commerce: 4, food: 2 } },
  { kind: 'order', words: /^(order|purchase|طلب|طلبات)$/, label: 'Order', icon: 'receipt_long', card: 'order', votes: { commerce: 1.5, food: 1.5, delivery: 1.5 } },
  { kind: 'banner', words: /^(banner|slider|slide|offer|promo|promotion|ad|advert|carousel|عرض|اعلان|بانر)$/, label: 'Offer', icon: 'local_offer', card: 'banner', votes: { commerce: 1.5, food: 1 } },
  { kind: 'review', words: /^(review|rating|feedback|تقييم|مراجعة)$/, label: 'Review', icon: 'star', card: 'post', votes: { commerce: 1, food: 1, booking: 0.5 } },
  { kind: 'address', words: /^(address|addresse|عنوان)$/, label: 'Address', icon: 'place', card: 'tile', votes: { commerce: 0.5, food: 0.5, delivery: 0.5 } },
  { kind: 'notification', words: /^(notification|alert|inbox|إشعار|اشعار|تنبيه)$/, label: 'Notification', icon: 'notifications', card: 'tile', votes: {} },
  { kind: 'wishlist', words: /^(wishlist|favorite|favourite|fav|like_?list|مفضلة)$/, label: 'Wishlist', icon: 'favorite', card: 'product', votes: { commerce: 3 } },
  { kind: 'coupon', words: /^(coupon|voucher|discount|promo_?code|كوبون|خصم)$/, label: 'Coupon', icon: 'confirmation_number', card: 'tile', votes: { commerce: 2, food: 1 } },
  { kind: 'payment', words: /^(payment|checkout|billing|دفع)$/, label: 'Payment', icon: 'credit_card', card: 'transaction', votes: { commerce: 1, finance: 1 } },
  { kind: 'user', words: /^(user|profile|account|me|customer|member|client|مستخدم|حساب|عميل)$/, label: 'Profile', icon: 'person', card: 'person', votes: {} },
  { kind: 'course', words: /^(course|subject|class|classe|program|curriculum|مادة|مواد|كورس|دورة)$/, label: 'Course', icon: 'school', card: 'course', votes: { education: 4 } },
  { kind: 'lesson', words: /^(lesson|lecture|video|chapter|unit|content|module|درس|محاضرة)$/, label: 'Lesson', icon: 'play_circle', card: 'article', votes: { education: 4 } },
  { kind: 'quiz', words: /^(quiz|exam|question|test|امتحان|اختبار|سؤال)$/, label: 'Quiz', icon: 'quiz', card: 'tile', votes: { education: 3 } },
  { kind: 'assignment', words: /^(assignment|homework|submission|واجب|تكليف)$/, label: 'Assignment', icon: 'assignment', card: 'tile', votes: { education: 3 } },
  { kind: 'grade', words: /^(grade|result|mark|score|transcript|درجة|نتيجة)$/, label: 'Grade', icon: 'grade', card: 'tile', votes: { education: 3 } },
  { kind: 'schedule', words: /^(schedule|timetable|calendar|session|attendance|جدول|حضور)$/, label: 'Schedule', icon: 'event_note', card: 'event', votes: { education: 2, health: 0.5 } },
  { kind: 'teacher', words: /^(teacher|instructor|tutor|professor|trainer|coach|معلم|مدرس)$/, label: 'Teacher', icon: 'person', card: 'person', votes: { education: 2 } },
  { kind: 'student', words: /^(student|learner|pupil|طالب|طلاب)$/, label: 'Student', icon: 'school', card: 'person', votes: { education: 3 } },
  { kind: 'delivery', words: /^(delivery|deliverie|shipment|parcel|package|consignment|توصيل|شحنة|طرد)$/, label: 'Delivery', icon: 'local_shipping', card: 'order', votes: { delivery: 4 } },
  { kind: 'trip', words: /^(trip|ride|journey|route|tow|towing|رحلة|مشوار|ونش)$/, label: 'Trip', icon: 'route', card: 'trip', votes: { ride: 4, delivery: 0.5 } },
  { kind: 'driver', words: /^(driver|courier|captain|rider|agent|delegate|سائق|مندوب|كابتن)$/, label: 'Driver', icon: 'two_wheeler', card: 'person', votes: { delivery: 3, ride: 2 } },
  { kind: 'vehicle', words: /^(vehicle|car|bike|fleet|garage|مركبة|سيارة)$/, label: 'Vehicle', icon: 'directions_car', card: 'tile', votes: { ride: 1, delivery: 0.5, automotive: 3 } },
  { kind: 'wallet', words: /^(wallet|balance|earning|payout|withdrawal|commission|محفظة|رصيد|ارباح|أرباح)$/, label: 'Wallet', icon: 'account_balance_wallet', card: 'transaction', votes: { finance: 2, delivery: 1, ride: 1 } },
  { kind: 'restaurant', words: /^(restaurant|vendor|merchant|shop|store|branch|kitchen|مطعم|متجر|فرع)$/, label: 'Restaurant', icon: 'storefront', card: 'venue', votes: { food: 3, commerce: 1 } },
  { kind: 'menu', words: /^(menu|dish|meal|food|recipe|وجبة|طبق)$/, label: 'Dish', icon: 'restaurant', card: 'product', votes: { food: 4 } },
  { kind: 'post', words: /^(post|feed|story|reel|tweet|status_?update|منشور)$/, label: 'Post', icon: 'dynamic_feed', card: 'post', votes: { social: 4 } },
  { kind: 'comment', words: /^(comment|reply|تعليق)$/, label: 'Comment', icon: 'chat_bubble', card: 'post', votes: { social: 2, news: 0.5 } },
  { kind: 'message', words: /^(message|chat|conversation|thread|رسالة|محادثة)$/, label: 'Message', icon: 'forum', card: 'person', votes: { social: 1.5 } },
  { kind: 'booking', words: /^(booking|reservation|appointment|حجز|موعد)$/, label: 'Booking', icon: 'event_available', card: 'event', votes: { booking: 4, health: 1, events: 1 } },
  { kind: 'listing', words: /^(room|hotel|property|propertie|listing|accommodation|apartment|villa|عقار|غرفة|شقة)$/, label: 'Place', icon: 'apartment', card: 'venue', votes: { booking: 3, realestate: 3 } },
  { kind: 'transaction', words: /^(transaction|transfer|statement|deposit|operation|معاملة|تحويل)$/, label: 'Transaction', icon: 'swap_horiz', card: 'transaction', votes: { finance: 4 } },
  { kind: 'event', words: /^(event|ticket|venue|concert|فعالية|تذكرة)$/, label: 'Event', icon: 'event', card: 'event', votes: { events: 4 } },
  { kind: 'task', words: /^(task|todo|issue|ticket_?task|مهمة)$/, label: 'Task', icon: 'task_alt', card: 'tile', votes: { tasks: 4 } },
  { kind: 'project', words: /^(project|board|workspace|sprint|مشروع)$/, label: 'Project', icon: 'folder', card: 'tile', votes: { tasks: 2 } },
  { kind: 'article', words: /^(article|news|blog|story_?news|مقال|خبر|اخبار)$/, label: 'Article', icon: 'article', card: 'article', votes: { news: 4 } },
  { kind: 'doctor', words: /^(doctor|physician|clinic|specialist|طبيب|دكتور|عيادة)$/, label: 'Doctor', icon: 'medical_services', card: 'person', votes: { health: 4 } },
  { kind: 'patient', words: /^(patient|مريض)$/, label: 'Patient', icon: 'personal_injury', card: 'person', votes: { health: 3 } },
  { kind: 'workout', words: /^(workout|exercise|training|class_?session|program_?day|routine|تمرين|تمارين)$/, label: 'Workout', icon: 'fitness_center', card: 'course', votes: { fitness: 4 } },
  { kind: 'service', words: /^(service|treatment|haircut|massage|manicure|خدمة|خدمات)$/, label: 'Service', icon: 'spa', card: 'venue', votes: { beauty: 2, health: 0.5, automotive: 0.5 } },
  { kind: 'flight', words: /^(flight|airline|airport|itinerary|طيران)$/, label: 'Flight', icon: 'flight', card: 'trip', votes: { travel: 4 } },
  { kind: 'job', words: /^(job|vacancy|vacancie|position|opening|career|وظيفة|وظائف)$/, label: 'Job', icon: 'work', card: 'article', votes: { jobs: 4 } },
  { kind: 'employee', words: /^(employee|staff|worker|payroll|leave|موظف|موظفين)$/, label: 'Employee', icon: 'badge', card: 'person', votes: { business: 3 } },
  { kind: 'lead', words: /^(lead|deal|opportunity|opportunitie|contact|prospect)$/, label: 'Lead', icon: 'handshake', card: 'person', votes: { business: 3 } },
  { kind: 'invoice', words: /^(invoice|bill|quotation|estimate|expense|فاتورة|فواتير)$/, label: 'Invoice', icon: 'request_quote', card: 'transaction', votes: { business: 2.5, finance: 1 } },
  { kind: 'media', words: /^(song|track|album|playlist|episode|podcast|movie|film|series|show|artist|اغنية|فيلم|مسلسل)$/, label: 'Media', icon: 'play_circle', card: 'course', votes: { media: 4 } },
  { kind: 'setting', words: /^(setting|config|configuration|preference|اعداد|إعداد)$/, label: 'Settings', icon: 'settings', card: 'tile', votes: {} },
];

/** Words in the collection/folder names or paths that point straight at a domain. */
export const DOMAIN_WORDS: { domain: DomainId; words: RegExp; weight: number }[] = [
  { domain: 'commerce', words: /^(shop|store|ecommerce|e-commerce|market|marketplace|mall|متجر|تسوق)$/, weight: 3 },
  { domain: 'food', words: /^(food|restaurant|eat|meal|talabat|مطعم|اكل|طعام)$/, weight: 3 },
  { domain: 'delivery', words: /^(delivery|courier|logistic|logistics|shipping|توصيل|مندوب|شحن)$/, weight: 4 },
  { domain: 'ride', words: /^(ride|taxi|uber|careem|cab|ridesharing|تاكسي)$/, weight: 4 },
  { domain: 'education', words: /^(college|faculty|department|semester|lecture|student|school|academy|learning|study|edu|education|lms|university|college|مدرسة|تعليم|جامعة)$/, weight: 4 },
  { domain: 'social', words: /^(social|community|network|feed|سوشيال)$/, weight: 3 },
  { domain: 'booking', words: /^(booking|hotel|travel|reservation|حجز|فندق)$/, weight: 3 },
  { domain: 'finance', words: /^(bank|banking|wallet|pay|payment|fintech|finance|بنك|محفظة)$/, weight: 3 },
  { domain: 'health', words: /^(health|clinic|medical|hospital|صحة|عيادة|مستشفى)$/, weight: 3 },
  { domain: 'realestate', words: /^(realestate|real-estate|property|properties|عقارات)$/, weight: 3 },
  { domain: 'news', words: /^(news|blog|magazine|media|اخبار)$/, weight: 3 },
  { domain: 'tasks', words: /^(task|todo|crm|helpdesk|support|kanban|tickets)$/, weight: 3 },
  { domain: 'automotive', words: /^(car|cars|vehicle|garage|towing|tow|spare|part|parts|insurance|maintenance|workshop|mechanic|carwash|zonecar|autoparts|auto|سيارة|سيارات|ونش|قطع|صيانة)$/, weight: 3.5 },
  { domain: 'fitness', words: /^(gym|fitness|workout|trainer|coach|yoga|crossfit|nutrition|diet|جيم|لياقة)$/, weight: 4 },
  { domain: 'beauty', words: /^(salon|spa|barber|beauty|nails|hair|makeup|cosmetic|skincare|صالون|تجميل|حلاق)$/, weight: 4 },
  { domain: 'travel', words: /^(travel|flight|airline|tour|tourism|visa|سفر|طيران|سياحة)$/, weight: 4 },
  { domain: 'jobs', words: /^(job|career|recruit|recruitment|hiring|vacancy|توظيف|وظائف)$/, weight: 4 },
  { domain: 'media', words: /^(music|stream|streaming|podcast|movie|video|radio|playlist|موسيقى|افلام)$/, weight: 4 },
  { domain: 'business', words: /^(crm|erp|hr|hrm|payroll|invoicing|accounting|inventory|pos|sales|backoffice|مبيعات|محاسبة|مخزون)$/, weight: 3 },
  { domain: 'events', words: /^(event|events|tickets|conference|فعاليات)$/, weight: 3 },
];

/** Verbs found at the end of paths (`/orders/{id}/accept`) and what they hint at. */
export const VERBS: { words: RegExp; label: string; votes: Partial<Record<DomainId, number>>; destructive?: boolean; icon: string }[] = [
  { words: /^(accept|approve|confirm|قبول)$/, label: 'Accept', votes: { delivery: 1.5, ride: 1 }, icon: 'check_circle' },
  { words: /^(reject|decline|refuse|رفض)$/, label: 'Decline', votes: { delivery: 1.5, ride: 1 }, destructive: true, icon: 'cancel' },
  { words: /^(pickup|pick-up|pick_up|picked|collect|استلام)$/, label: 'Picked up', votes: { delivery: 2 }, icon: 'inventory' },
  { words: /^(deliver|delivered|complete|completed|finish|done|تسليم)$/, label: 'Mark delivered', votes: { delivery: 2 }, icon: 'task_alt' },
  { words: /^(start|begin|arrive|arrived|on-the-way|ontheway)$/, label: 'Start', votes: { delivery: 1, ride: 1.5 }, icon: 'play_arrow' },
  { words: /^(cancel|إلغاء|الغاء)$/, label: 'Cancel', votes: {}, destructive: true, icon: 'block' },
  { words: /^(enroll|enrol|join|subscribe|اشتراك|تسجيل)$/, label: 'Enroll', votes: { education: 2 }, icon: 'how_to_reg' },
  { words: /^(submit|answer|attempt|تسليم_الواجب)$/, label: 'Submit', votes: { education: 1.5 }, icon: 'send' },
  { words: /^(like|unlike|follow|unfollow|share|react)$/, label: 'Like', votes: { social: 2 }, icon: 'favorite' },
  { words: /^(checkout|pay|purchase|buy)$/, label: 'Checkout', votes: { commerce: 2 }, icon: 'shopping_cart_checkout' },
  { words: /^(rate|review|rating|feedback)$/, label: 'Rate', votes: { commerce: 0.5, food: 0.5, ride: 0.5 }, icon: 'star' },
  { words: /^(online|offline|availability|available|toggle|toggle-status|go-online)$/, label: 'Go online', votes: { delivery: 2, ride: 2 }, icon: 'power_settings_new' },
  { words: /^(read|read-all|read_all|readall|mark-read|mark_as_read|mark-as-read|mark-all-read|mark-all-as-read|seen)$/, label: 'Mark as read', votes: {}, icon: 'done_all' },
  { words: /^(retry|try-again|retry-payment)$/, label: 'Try again', votes: {}, icon: 'swap_horiz' },
  { words: /^(escalate|support|help|report|dispute)$/, label: 'Contact support', votes: {}, icon: 'forum' },
  { words: /^(default|set-default|make-default|primary|set_default)$/, label: 'Set as default', votes: {}, icon: 'check_circle' },
  { words: /^(track|tracking|location|تتبع)$/, label: 'Track', votes: { delivery: 1.5, ride: 1 }, icon: 'my_location' },
];

/** Response field names that hint at a domain. */
export const FIELD_HINTS: { words: RegExp; votes: Partial<Record<DomainId, number>> }[] = [
  { words: /^(price|sale_price|sku|stock|in_stock|old_price|discount_price)$/, votes: { commerce: 1, food: 0.5 } },
  { words: /^(lat|lng|latitude|longitude|pickup_address|dropoff_address|delivery_address|eta)$/, votes: { delivery: 1, ride: 1 } },
  { words: /^(progress|grade|lessons_count|enrolled|instructor|teacher_name|completion)$/, votes: { education: 1 } },
  { words: /^(balance|iban|account_number|transaction_type|credit|debit)$/, votes: { finance: 1 } },
  { words: /^(likes|likes_count|followers|comments_count|caption)$/, votes: { social: 1 } },
  { words: /^(check_in|check_out|nights|guests)$/, votes: { booking: 1 } },
];

export interface DomainDef {
  id: DomainId;
  label: string;
  tagline: string;
  icon: string;
  theme: DesignTheme;
  /** Entity kinds, in priority order, that deserve a bottom tab. */
  tabKinds: EntityKind[][];
  /** Home tab title. */
  homeLabel: string;
}

const light = (primary: string, accent: string, style: DesignTheme['style'], radius = 16): DesignTheme => ({
  mode: 'light',
  primary,
  accent,
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  radius,
  style,
});

export const DOMAINS: Record<DomainId, DomainDef> = {
  commerce: { id: 'commerce', label: 'Online store', tagline: 'Everything you love, delivered', icon: 'storefront', theme: light('#F2542D', '#0E9F6E', 'soft', 18), tabKinds: [['category', 'product'], ['cart', 'wishlist'], ['order']], homeLabel: 'Shop' },
  food: { id: 'food', label: 'Food delivery', tagline: 'Hungry? We have got you', icon: 'restaurant', theme: light('#E23744', '#F59E0B', 'playful', 20), tabKinds: [['restaurant', 'menu'], ['order'], ['cart']], homeLabel: 'Discover' },
  delivery: {
    id: 'delivery',
    label: 'Courier app',
    tagline: 'Deliver more, earn more',
    icon: 'two_wheeler',
    theme: { mode: 'dark', primary: '#22C55E', accent: '#FACC15', background: '#0B0F14', surface: '#151B23', text: '#F3F4F6', muted: '#94A3B8', radius: 18, style: 'bold' },
    tabKinds: [['order', 'delivery', 'trip'], ['wallet', 'transaction', 'payment'], ['notification']],
    homeLabel: 'Home',
  },
  automotive: {
    id: 'automotive',
    label: 'Car services',
    tagline: 'Everything your car needs',
    icon: 'directions_car',
    theme: { mode: 'light', primary: '#1E40AF', accent: '#F59E0B', background: '#F2F4F8', surface: '#FFFFFF', text: '#0B1220', muted: '#64748B', radius: 16, style: 'bold' },
    tabKinds: [['product', 'category'], ['vehicle'], ['cart', 'order', 'trip']],
    homeLabel: 'Home',
  },
  ride: {
    id: 'ride',
    label: 'Ride hailing',
    tagline: 'Wherever you are going',
    icon: 'local_taxi',
    theme: { mode: 'light', primary: '#111111', accent: '#276EF1', background: '#FFFFFF', surface: '#F3F3F3', text: '#111111', muted: '#6B6B6B', radius: 14, style: 'minimal' },
    tabKinds: [['trip', 'order'], ['wallet', 'payment', 'transaction']],
    homeLabel: 'Home',
  },
  education: { id: 'education', label: 'Learning app', tagline: 'Learn something new today', icon: 'school', theme: light('#4F46E5', '#F59E0B', 'playful', 20), tabKinds: [['course', 'lesson', 'product'], ['schedule', 'assignment', 'quiz', 'grade'], ['notification']], homeLabel: 'Home' },
  social: { id: 'social', label: 'Social network', tagline: 'Share your moments', icon: 'diversity_3', theme: light('#E1306C', '#833AB4', 'playful', 18), tabKinds: [['post'], ['message'], ['notification']], homeLabel: 'Feed' },
  booking: { id: 'booking', label: 'Bookings', tagline: 'Find your next stay', icon: 'hotel', theme: light('#E11D48', '#0EA5E9', 'soft', 18), tabKinds: [['listing'], ['booking'], ['wishlist']], homeLabel: 'Explore' },
  finance: {
    id: 'finance',
    label: 'Banking',
    tagline: 'Your money, simplified',
    icon: 'account_balance',
    theme: { mode: 'light', primary: '#1D4ED8', accent: '#10B981', background: '#F3F5FA', surface: '#FFFFFF', text: '#0F172A', muted: '#64748B', radius: 18, style: 'minimal' },
    tabKinds: [['transaction', 'payment'], ['wallet'], ['notification']],
    homeLabel: 'Home',
  },
  health: { id: 'health', label: 'Health care', tagline: 'Care that comes to you', icon: 'favorite', theme: light('#0D9488', '#6366F1', 'soft', 18), tabKinds: [['doctor'], ['booking'], ['notification']], homeLabel: 'Home' },
  realestate: { id: 'realestate', label: 'Real estate', tagline: 'Find a place to call home', icon: 'apartment', theme: light('#0F766E', '#F59E0B', 'soft', 16), tabKinds: [['listing'], ['wishlist', 'booking'], ['message']], homeLabel: 'Explore' },
  news: { id: 'news', label: 'News', tagline: 'Stories that matter', icon: 'newspaper', theme: light('#111827', '#DC2626', 'minimal', 12), tabKinds: [['article'], ['category'], ['notification']], homeLabel: 'Today' },
  tasks: { id: 'tasks', label: 'Productivity', tagline: 'Get things done', icon: 'task_alt', theme: light('#2563EB', '#7C3AED', 'minimal', 14), tabKinds: [['task'], ['project'], ['notification']], homeLabel: 'Today' },
  events: { id: 'events', label: 'Events', tagline: 'Do not miss out', icon: 'celebration', theme: light('#7C3AED', '#F43F5E', 'playful', 18), tabKinds: [['event'], ['booking'], ['notification']], homeLabel: 'Discover' },
  fitness: { id: 'fitness', label: 'Fitness', tagline: 'Stronger every day', icon: 'fitness_center', theme: light('#F97316', '#111827', 'bold', 16), tabKinds: [['workout'], ['booking', 'schedule'], ['product', 'order']], homeLabel: 'Today' },
  beauty: { id: 'beauty', label: 'Beauty & salon', tagline: 'Look good, feel great', icon: 'spa', theme: light('#DB2777', '#8B5CF6', 'soft', 18), tabKinds: [['service', 'listing'], ['booking'], ['product', 'wishlist']], homeLabel: 'Discover' },
  travel: { id: 'travel', label: 'Travel', tagline: 'Your next trip starts here', icon: 'flight', theme: light('#0284C7', '#F97316', 'glass', 20), tabKinds: [['flight', 'listing'], ['booking'], ['wishlist']], homeLabel: 'Explore' },
  jobs: { id: 'jobs', label: 'Jobs', tagline: 'Find work you love', icon: 'work', theme: light('#0A66C2', '#16A34A', 'minimal', 12), tabKinds: [['job'], ['booking', 'assignment', 'order'], ['message', 'notification']], homeLabel: 'Jobs' },
  media: { id: 'media', label: 'Streaming', tagline: 'Press play', icon: 'play_circle', theme: light('#1DB954', '#A78BFA', 'neon', 16), tabKinds: [['media'], ['category'], ['wishlist']], homeLabel: 'Home' },
  business: { id: 'business', label: 'Business tools', tagline: 'Run your business on the go', icon: 'business_center', theme: light('#2563EB', '#0EA5E9', 'minimal', 12), tabKinds: [['lead', 'order'], ['invoice', 'payment', 'transaction'], ['employee', 'task']], homeLabel: 'Dashboard' },
  generic: { id: 'generic', label: 'App', tagline: 'Everything in one place', icon: 'apps', theme: light('#FF6C37', '#0EA5E9', 'soft', 16), tabKinds: [], homeLabel: 'Home' },
};

export const kindDef = (kind: EntityKind): KindDef => KINDS.find((k) => k.kind === kind) || { kind: 'other', words: /$^/, label: 'Item', icon: 'widgets', card: 'tile', votes: {} };

/** `in_stock` / `inStock` → "In stock". */
export const humanize = (word: string) =>
  word
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
