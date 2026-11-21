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
  | 'automotive'
  | 'fitness'
  | 'beauty'
  | 'travel'
  | 'jobs'
  | 'media'
  | 'business'
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
  | 'workout'
  | 'service'
  | 'flight'
  | 'job'
  | 'employee'
  | 'lead'
  | 'invoice'
  | 'media'
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
  | 'otpRequest'
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
  /** List screens: filter controls built from every request in the collection that hits this endpoint. */
  filters?: DesignFilter[];
  /** Every request of the collection hitting this endpoint, with the query inputs it accepts. */
  variants?: { action: string; params: string[]; label: string }[];
  /** Demo rows for endpoints without a saved response, shown with a "sample data" badge. */
  sample?: unknown[];
}

/** One control of a list screen, mapped to a query parameter. */
export interface DesignFilter {
  name: string;
  kind: 'search' | 'sort' | 'toggle' | 'min' | 'max' | 'enum' | 'ref';
  label: string;
  options?: { value: string; label: string }[];
  /** `ref`: the entity whose items are the choices (categoryId → category). */
  entity?: string;
}

/** A list shown inside an item's page: products of a category, reviews of a product… */
export interface DesignRelation {
  entity: string;
  action: string;
  /** Input that receives the item id (query `categoryId` or path `{vendorId}`). */
  param: string;
  via: 'query' | 'path';
  label: string;
  /** Lists of the same entity (sub-categories) are drawn as chips. */
  self?: boolean;
}

/** One screen of a sign-in or sign-up flow. */
export interface AuthStep {
  action: string;
  kind: 'identify' | 'otp' | 'credentials' | 'details';
  title: string;
  /** Request again (e.g. "Resend code") on the same screen. */
  resend?: string;
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
  relations?: DesignRelation[];
  ctas: { label: string; action: string; style: 'primary' | 'secondary' | 'danger'; icon: string; prefill?: Record<string, string> }[];
  /** Detail-page fields the owner hid, and the labels they renamed. */
  hiddenFields?: string[];
  fieldLabels?: Record<string, string>;
}

export type SectionType =
  | 'greeting'
  | 'search'
  | 'hero'
  | 'chips'
  | 'grid'
  | 'rail'
  | 'list'
  | 'stats'
  | 'map'
  | 'status'
  | 'balance'
  | 'shortcuts'
  | 'feed'
  /* content blocks people add in the design studio */
  | 'text'
  | 'image'
  | 'button'
  | 'banner'
  | 'spacer'
  | 'insights';

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
  /** Content blocks: heading/body text, image URL, button target. */
  body?: string;
  image?: string;
  /** `button`: open an entity list, run an action, or open a page. */
  target?: { entity?: string; action?: string; page?: string; values?: Record<string, string> };
  /** `grid`/`rail`/`list`: columns for grids (2 or 3). */
  columns?: number;
  visibility?: 'all' | 'signedIn' | 'guest';
  animate?: 'none' | 'fade' | 'slide' | 'pop';
  /** Shortcut buttons (type `shortcuts`). */
  items?: { label: string; icon: string; entity?: string; action?: string; values?: Record<string, string> }[];
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
  /** Visual personality (preset): shadows, borders, shapes and motion. */
  style: ThemeStyle;
  /** Google font family names (from the renderer's font list). */
  font?: string;
  headingFont?: string;
  density?: 'compact' | 'comfortable' | 'spacious';
  tabStyle?: 'floating' | 'docked' | 'minimal';
  headerStyle?: 'large' | 'centered' | 'compact';
  cardStyle?: 'shadow' | 'outline' | 'flat' | 'glass';
  /** Text size multiplier (0.85 – 1.25). */
  scale?: number;
  buttonStyle?: 'rounded' | 'pill' | 'square';
  motion?: 'none' | 'subtle' | 'lively';
  pattern?: 'none' | 'dots' | 'grid' | 'waves';
  gradient?: 'none' | 'soft' | 'vivid';
}

export type ThemeStyle = 'soft' | 'bold' | 'minimal' | 'playful' | 'glass' | 'elegant' | 'brutal' | 'neon' | 'classic';

export interface AppDesign {
  version: number;
  domain: { id: DomainId; label: string; confidence: number; evidence: string[]; scores: Record<string, number> };
  brand: { name: string; tagline: string; icon: string; logo?: string };
  /** Writing direction: `rtl` for collections written in Arabic. */
  dir?: 'ltr' | 'rtl';
  /** Extra pages built in the design studio (shown as tabs that point at `page.<id>`). */
  pages?: { id: string; title: string; icon: string; sections: DesignSection[] }[];
  theme: DesignTheme;
  splash?: { style?: 'brand' | 'gradient' | 'minimal'; duration?: number };
  auth: { login?: string; register?: string; otp?: string; logout?: string; me?: string; updateProfile?: string; required: boolean; flows?: { login?: AuthStep[]; register?: AuthStep[] } };
  tabs: { id: string; label: string; icon: string; screen: string }[];
  screens: Record<string, DesignScreen>;
  entities: Record<string, DesignEntity>;
  /** Endpoints that fit no entity; still reachable from the developer menu. */
  looseActions: string[];
}
