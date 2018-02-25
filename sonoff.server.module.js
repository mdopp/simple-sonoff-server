module.exports.createServer = function (config) {
    const CONNECTION_IS_ALIVE_CHECK_INTERVAL = 30000;
   
    const fs = require('fs');
    const path = require('path');
    const ws = require("nodejs-websocket");
    const log = config.logger;

    if (config.server.privateKey === undefined)
        config.server.privateKey = fs.readFileSync(path.resolve(__dirname, './certs/server.key'));

    if (config.server.certificate === undefined)
        config.server.certificate = fs.readFileSync(path.resolve(__dirname, './certs/server.crt'));

    //set initialized parameters
    var state = {
        knownDevices: [],
        listeners: {
            onDeviceConnectedListeners: [],
            onDeviceDisconnectedListeners: [],
            onDeviceUpdatedListeners: []
        }
    };

    // device in der liste finden
    state.getDeviceById = (deviceId) => {
        return state.knownDevices.find(d => d.id == deviceId);
    };

    state.updateKnownDevice = (device) => {
        var updated = false;

        for (var i = 0; i < state.knownDevices.length; i++) {
            if (state.knownDevices[i].id == device.id) {
                state.knownDevices[i] = device;
                updated = true;
                callDeviceListeners(state.listeners.onDeviceUpdatedListeners, device);
            }
        }
        if (!updated) {
            state.knownDevices.push(device);
            callDeviceListeners(state.listeners.onDeviceConnectedListeners, device);
        }
    };

    function callDeviceListeners(listeners, device) {
        const deviceListeners = listeners[device.id];
        if (!deviceListeners)
            return;
        deviceListeners.forEach(listener => listener(device.state));
    }

    function addDeviceListener(listeners, deviceId, listener) {
        if (!listeners[deviceId]) {
            listeners[deviceId] = [listener];
        } else {
            listeners[deviceId].push(listener);
        }
    }

    state.pushMessage = a => {
        var rq = {
            "apikey": "111111111-1111-1111-1111-111111111111",
            "action": a.action,
            "deviceid": a.target,
            "params": a.value,
            "userAgent": "app",
            "sequence": Date.now().toString(),
            "ts": 0,
            "from": "app"
        };
        var r = JSON.stringify(rq);
        log.trace('REQ | WS | APP | ' + r);
        var device = state.getDeviceById(a.target);
        if (!device.messages) device.messages = [];
        device.messages.push(rq);
        device.conn.sendText(r);
    };

    function addConnectionIsAliveCheck(device) {
        device.isAlive = true;

        device.isAliveIntervalId = setInterval(() => {
            if (device.conn.readyState == device.conn.CONNECTING) return;
            if (!device.isAlive) {
                clearInterval(device.isAliveIntervalId);
                return device.conn.close(408, "connection timed out");
            }
            device.isAlive = false;
            device.conn.sendPing();
        }, CONNECTION_IS_ALIVE_CHECK_INTERVAL);

        device.conn.on("pong", () => {
            device.isAlive = true;
        });
    }

    // ----------- api server ------------------------
    // Import libraries
    var express = require('express');
    var server = express();
    var bodyParser = require('body-parser')
    var https = require('https');

    // Register body-parser
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));

    // Create http(s) server
    var credentials = {
        key: config.server.privateKey,
        cert: config.server.certificate,
        rejectUnauthorized: false
    };

    var httpsServer = https.createServer(credentials, server);

    httpsServer.listen(config.server.httpsPort, function () {
        log.log('SONOFF Server Started On Port %d', config.server.httpsPort);
    });

    // Register routes
    server.post('/dispatch/device', function (req, res) {
        log.log('REQ | %s | %s ', req.method, req.url);
        log.trace('REQ | %s', JSON.stringify(req.body));
        res.json({
            "error": 0,
            "reason": "ok",
            "IP": config.server.IP,
            "port": config.server.websocketPort
        });
    });

    // Register routes
    server.get('/', function (req, res) {
        log.log('REQ | %s | %s ', req.method, req.url);
        res.send('OK');
    });

    // ----------- sonoff server ------------------------
    // setup a server, that will respond to the SONOFF requests
    // this is the replacement for the SONOFF cloud!
    var wsOptions = {
        secure: true,
        key: config.server.privateKey,
        cert: config.server.certificate
    };

    const wsServer = ws.createServer(wsOptions, function (conn) {
        log.log("WS | Server is up %s:%s to %s:%s", config.server.IP, config.server.websocketPort, conn.socket.remoteAddress, conn.socket.remotePort);

        conn.on("text", function (str) {
            var data = JSON.parse(str);
            log.trace('REQ | WS | DEV | %s', JSON.stringify(data));
            res = {
                "error": 0,
                "deviceid": data.deviceid,
                "apikey": "111111111-1111-1111-1111-111111111111"
            };
            if (data.action) {
                switch (data.action) {
                    case 'date':
                        res.date = new Date().toISOString();
                        break;
                    case 'query':
                        //device wants information
                        var device = state.getDeviceById(data.deviceid);
                        if (!device) {
                            log.error('ERR | WS | Unknown device ', data.deviceid);
                        } else {
                            /*if(data.params.includes('timers')){
                             log.log('INFO | WS | Device %s asks for timers',device.id);
                             if(device.timers){
                              res.params = [{timers : device.timers}];
                             }
                            }*/
                            res.params = {};
                            data.params.forEach(p => {
                                res.params[p] = device[p];
                            });
                        }
                        break;
                    case 'update':
                        //device wants to update its state
                        var device = state.getDeviceById(data.deviceid);
                        if (!device) {
                            log.error('ERR | WS | Unknown device ', data.deviceid);
                        } else {
                            device.state = data.params.switch;
                            device.conn = conn;
                            device.rawMessageLastUpdate = data;
                            device.rawMessageLastUpdate.timestamp = Date.now();
                            state.updateKnownDevice(device);
                        }

                        break;
                    case 'register':
                        var device = {
                            id: data.deviceid
                        };

                        //this is not valid anymore?! type is not based on the first two chars
                        var type = data.deviceid.substr(0, 2);
                        if (type == '01') device.kind = 'switch';
                        else if (type == '02') device.kind = 'light';
                        else if (type == '03') device.kind = 'sensor'; //temperature and humidity. No timers here;

                        device.version = data.romVersion;
                        device.model = data.model;
                        device.conn = conn;
                        device.rawMessageRegister = data;
                        device.rawMessageRegister.timestamp = Date.now();
                        addConnectionIsAliveCheck(device);
                        state.updateKnownDevice(device);
                        log.log('INFO | WS | Device %s registered', device.id);
                        break;
                    default: log.error('TODO | Unknown action "%s"', data.action); break;
                }
            } else {
                if (data.sequence && data.deviceid) {
                    var device = state.getDeviceById(data.deviceid);
                    if (!device) {
                        log.error('ERR | WS | Unknown device ', data.deviceid);
                    } else {
                        if (device.messages) {
                            var message = device.messages.find(item => item.sequence == data.sequence);
                            if (message) {
                                device.messages = device.messages.filter(function (item) {
                                    return item !== message;
                                })
                                device.state = message.params.switch;
                                state.updateKnownDevice(device);
                                log.trace('INFO | WS | APP | action has been accnowlaged by the device ' + JSON.stringify(data));
                            } else {
                                log.error('ERR | WS | No message send, but received an anser', JSON.stringify(data));
                            }
                        } else {
                            log.error('ERR | WS | No message send, but received an anser', JSON.stringify(data));
                        }
                    }
                } else {
                    log.error('TODO | WS | Not data action frame\n' + JSON.stringify(data));
                }
            }
            var r = JSON.stringify(res);
            log.trace('RES | WS | DEV | ' + r);
            conn.sendText(r);
        });
        conn.on("close", function (code, reason) {
            log.log("Connection closed: %s (%d)", reason, code);
            state.knownDevices.forEach((device, index) => {
                if (device.conn != conn)
                    return;
                log.log("Device %s disconnected", device.id);
                clearInterval(device.isAliveIntervalId);
                callDeviceListeners(state.listeners.onDeviceDisconnectedListeners, device);
                device.conn = undefined;
            });
        });
        conn.on("error", function (error) {
            log.error("Connection error: ", error);
        });
    }).listen(config.server.websocketPort);

    return {
        //currently all known devices are returned with a hint if they are currently connected
        getConnectedDevices: () => {
            return state.knownDevices.map(x => {
                return { id: x.id, state: x.state, model: x.model, kind: x.kind, version: x.version, isConnected: (typeof x.conn !== 'undefined'), isAlive: x.isAlive, rawMessageRegister: x.rawMessageRegister, rawMessageLastUpdate: x.rawMessageLastUpdate }
            });
        },

        getDeviceState: (deviceId) => {
            var d = state.getDeviceById(deviceId);
            if (!d || (typeof d.conn == 'undefined')) return "disconnected";
            return d.state;
        },

        turnOnDevice: (deviceId) => {
            var d = state.getDeviceById(deviceId);
            if (!d || (typeof d.conn == 'undefined')) return "disconnected";
            state.pushMessage({ action: 'update', value: { switch: "on" }, target: deviceId });
            return "on";
        },

        turnOffDevice: (deviceId) => {
            var d = state.getDeviceById(deviceId);
            if (!d || (typeof d.conn == 'undefined')) return "disconnected";
            state.pushMessage({ action: 'update', value: { switch: "off" }, target: deviceId });
            return "off";
        },

        registerOnDeviceConnectedListener: (deviceId, listener) => {
            addDeviceListener(state.listeners.onDeviceConnectedListeners, deviceId, listener);
        },

        registerOnDeviceDisconnectedListener: (deviceId, listener) => {
            addDeviceListener(state.listeners.onDeviceDisconnectedListeners, deviceId, listener);
        },

        registerOnDeviceUpdatedListener: (deviceId, listener) => {
            addDeviceListener(state.listeners.onDeviceUpdatedListeners, deviceId, listener);
        },

        close: () => {
            log.log("Stopping server");
            state.knownDevices.forEach(device => device.conn.close());
            httpsServer.close();
            wsServer.close();
            log.log("Stopped server");
        }
    }
}
