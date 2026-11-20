/**
 * App design: how a collection should look and feel as a real mobile app.
 * Pure data produced from the API model; the client renders it. No I/O.
 */

export type DomainId =
  | 'commerce'
  | 'food'
  | 'delivery'
  | 'ride'
  | 'education'
  | 'social'
  | 'booking'
  | 'finance'
  | 'health'
  | 'realestate'
  | 'news'
  | 'tasks'
  | 'events'
  | 'generic';

export type EntityKind =
  | 'product'
  | 'category'
  | 'cart'
  | 'order'
  | 'banner'
  | 'review'
  | 'address'
  | 'notification'
  | 'wishlist'
  | 'coupon'
  | 'payment'
  | 'user'
  | 'course'
  | 'lesson'
  | 'quiz'
  | 'assignment'
  | 'grade'
  | 'schedule'
  | 'teacher'
  | 'student'
  | 'delivery'
  | 'trip'
  | 'driver'
  | 'vehicle'
  | 'wallet'
  | 'restaurant'
  | 'menu'
  | 'post'
  | 'comment'
  | 'message'
  | 'booking'
  | 'listing'
  | 'transaction'
  | 'event'
  | 'task'
  | 'project'
  | 'article'
  | 'doctor'
  | 'patient'
  | 'setting'
  | 'other';

/** How one item of an entity is drawn. */
export type CardStyle =
  | 'product'
  | 'venue'
  | 'course'
  | 'order'
  | 'person'
  | 'post'
  | 'trip'
  | 'transaction'
  | 'article'
  | 'event'
  | 'banner'
  | 'chip'
  | 'tile';

export type Intent =
  | 'list'
  | 'detail'
  | 'single'
  | 'create'
  | 'update'
  | 'delete'
  | 'action'
  | 'search'
  | 'login'
  | 'register'
  | 'otp'
  | 'logout'
  | 'me'
  | 'updateProfile'
  | 'composite';

/** Which response field plays which visual role (dotted paths for one level of nesting, e.g. `customer.name`). */
export interface FieldRoles {
  id?: string;
  title?: string;
  subtitle?: string;
  image?: string;
  price?: string;
  oldPrice?: string;
  currency?: string;
  rating?: string;
  status?: string;
  date?: string;
  quantity?: string;
  progress?: string;
  badge?: string;
  description?: string;
  person?: string;
  address?: string;
  lat?: string;
  lng?: string;
  phone?: string;
  email?: string;
}

/** One endpoint, as the app uses it. */
export interface DesignOp {
  /** Action id in the application schema (what the client invokes). */
  action: string;
  endpoint: string;
  method: string;
  intent: Intent;
  /** Human label: "Accept", "Add to cart", "Enroll"… */
  label: string;
  verb?: string;
  /** Where the list/record lives inside the response body. */
  dataPath: string[];
  roles: FieldRoles;
  pathParams: string[];
  /** Body/query fields the user has to fill (path params excluded). */
  inputs: string[];
  destructive?: boolean;
}

export interface DesignEntity {
  id: string;
  kind: EntityKind;
  label: string;
  plural: string;
  icon: string;
  card: CardStyle;
  roles: FieldRoles;
  ops: DesignOp[];
  /**
   * Buttons on an item's detail screen, possibly calling another entity's endpoint (e.g. product → Add to cart).
   * `prefill` maps an input name to `item.<field>` of the shown item.
   */
  ctas: { label: string; action: string; style: 'primary' | 'secondary' | 'danger'; icon: string; prefill?: Record<string, string> }[];
}

export type SectionType = 'greeting' | 'search' | 'hero' | 'chips' | 'grid' | 'rail' | 'list' | 'stats' | 'map' | 'status' | 'balance' | 'shortcuts' | 'feed';

export interface DesignSection {
  id: string;
  type: SectionType;
  title?: string;
  entity?: string;
  action?: string;
  dataPath?: string[];
  roles?: FieldRoles;
  card?: CardStyle;
  limit?: number;
  /** Tab/screen opened by "See all". */
  seeAll?: string;
  /** Shortcut buttons (type `shortcuts`). */
  items?: { label: string; icon: string; entity?: string; action?: string }[];
}

export interface DesignScreen {
  id: string;
  kind: 'home' | 'browse' | 'profile' | 'more';
  title: string;
  entity?: string;
  sections?: DesignSection[];
}

export interface DesignTheme {
  mode: 'light' | 'dark';
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  radius: number;
  /** Visual personality used by the renderer for small details (shadows, density). */
  style: 'soft' | 'bold' | 'minimal' | 'playful';
}

export interface AppDesign {
  version: 1;
  domain: { id: DomainId; label: string; confidence: number; evidence: string[]; scores: Record<string, number> };
  brand: { name: string; tagline: string; icon: string };
  theme: DesignTheme;
  auth: { login?: string; register?: string; otp?: string; logout?: string; me?: string; updateProfile?: string; required: boolean };
  tabs: { id: string; label: string; icon: string; screen: string }[];
  screens: Record<string, DesignScreen>;
  entities: Record<string, DesignEntity>;
  /** Endpoints that fit no entity; still reachable from the developer menu. */
  looseActions: string[];
}
