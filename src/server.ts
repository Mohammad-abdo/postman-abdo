import http from 'http';
import { createApp } from './app';
import { bootstrap } from './bootstrap';
import { env } from './config/env';
import { getRedis } from './core/cache/redis';
import { attachWsProxy } from './modules/websocket/ws-proxy';
import { monitorService } from './modules/monitors/monitor.service';

getRedis();
const server = http.createServer(createApp());
attachWsProxy(server);

server.listen(env.port, async () => {
  console.log(`Fack Postman API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  try {
    await bootstrap();
    await monitorService.startAll();
  } catch (e) {
    console.error('Startup tasks failed', e);
  }
});
