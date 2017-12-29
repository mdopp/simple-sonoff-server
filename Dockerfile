FROM arm32v7/node:9.3-slim

ENV HTTP_PORT=8080
ENV HTTPS_PORT=8443
ENV WEBSOCKET_PORT=9443

WORKDIR simple-sonoff-server
ADD ./ ./

RUN npm install 
CMD node sonoff.server.js
