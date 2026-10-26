import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { attachWsProxy } from './modules/websocket/ws-proxy';
import { monitorService } from './modules/monitors/monitor.service';

const server = http.createServer(createApp());
attachWsProxy(server);

server.listen(env.port, () => {
  console.log(`Fack Postman API listening on http://localhost:${env.port}`);
  monitorService.startAll().catch((e) => console.error('Could not start monitors', e));
});
