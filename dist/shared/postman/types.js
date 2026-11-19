"use strict";
/** Internal data shapes stored in the database (JSON columns) and exchanged with the client. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyBody = void 0;
const emptyBody = () => ({
    mode: 'none',
    raw: '',
    rawLanguage: 'json',
    formdata: [],
    urlencoded: [],
    file: { src: '' },
    graphql: { query: '', variables: '' },
});
exports.emptyBody = emptyBody;
