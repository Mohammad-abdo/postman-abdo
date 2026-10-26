/** Internal data shapes stored in the database (JSON columns) and exchanged with the client. */

export interface KeyValue {
  key: string;
  value: string;
  enabled?: boolean;
  description?: string;
}

export interface FormDataField extends KeyValue {
  type?: 'text' | 'file';
  src?: string;
  contentType?: string;
}

export type BodyMode = 'none' | 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';

export interface BodyModel {
  mode: BodyMode;
  raw: string;
  rawLanguage: string;
  formdata: FormDataField[];
  urlencoded: KeyValue[];
  file: { src: string };
  graphql: { query: string; variables: string };
}

/** `{ type: 'bearer', bearer: { token: '...' } }` — params keyed by auth type. */
export interface AuthModel {
  type: string;
  [type: string]: any;
}

export interface Variable {
  key: string;
  value: string;
  currentValue?: string;
  type?: 'default' | 'secret';
  enabled?: boolean;
  description?: string;
}

export interface RequestModel {
  id?: string;
  collectionId?: string | null;
  folderId?: string | null;
  type?: string;
  name: string;
  method: string;
  url: string;
  params?: KeyValue[];
  pathVariables?: KeyValue[];
  headers?: KeyValue[];
  body?: BodyModel;
  auth?: AuthModel;
  preRequestScript?: string | null;
  testScript?: string | null;
  settings?: Record<string, unknown>;
  description?: string | null;
  sortOrder?: number;
  examples?: ExampleModel[];
}

export interface ExampleModel {
  id?: string;
  name: string;
  request?: Partial<RequestModel> | null;
  code: number;
  status: string;
  headers?: KeyValue[];
  body?: string | null;
  language?: string;
  sortOrder?: number;
}

/** Postman Collection v2.1 JSON is loosely typed on purpose. */
export type V2Json = any;

export const emptyBody = (): BodyModel => ({
  mode: 'none',
  raw: '',
  rawLanguage: 'json',
  formdata: [],
  urlencoded: [],
  file: { src: '' },
  graphql: { query: '', variables: '' },
});
