const fs = require('fs');
const path = require('path');
const sonoffServer = require("./sonoff.server.module.js");
var express = require('express');
var server = express();
var bodyParser = require('body-parser')
var http = require('http');

const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, './sonoff.config.json')));

config.logger = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    trace: console.info,
    debug: console.debug,
};

if (process.env.HTTP_PORT !== undefined)
    config.server.httpPort = process.env.HTTP_PORT;
if (process.env.HTTPS_PORT !== undefined)
    config.server.httpsPort = process.env.HTTPS_PORT;
if (process.env.WEBSOCKET_PORT !== undefined)
    config.server.websocketPort = process.env.WEBSOCKET_PORT;
if (process.env.SERVER_IP !== undefined)
    config.server.IP = process.env.SERVER_IP;


const log = config.logger;

// call sonoff server for device handling 
var devices = sonoffServer.createServer(config);

// Register body-parser
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: true }));

var httpServer = http.createServer(server)

httpServer.listen(config.server.httpPort, function () {
    log.log('API Server Started On Port %d', config.server.httpPort);
});

//returns an simple 0 or 1 for a known device
server.get('/devices/:deviceId/status', function (req, res) {
    log.log('GET | %s | %s ', req.method, req.url);

    var d = devices.getDeviceState(req.params.deviceId);

    if (!d || d == "disconnected") {
        res.status(404).send('Sonoff device ' + req.params.deviceId + ' not found');
    } else {
        res.status(200).send(((d == 'on') ? '1' : '0'));
    }
});

//switch the device
server.get('/devices/:deviceId/:state', function (req, res) {
    log.log('GET | %s | %s ', req.method, req.url);
    var d = devices.getDeviceState(req.params.deviceId);

    if (!d || d == "disconnected") {
        res.status(404).send('Sonoff device ' + req.params.deviceId + ' not found');
    } else {
        switch (req.params.state.toUpperCase()) {
            case "1":
            case "ON":
                res.sendStatus(200);
                devices.turnOnDevice(req.params.deviceId);
                break;
            case "0":
            case "OFF":
                res.sendStatus(200);
                devices.turnOffDevice(req.params.deviceId);
                break;
            default:
                res.status(404).send('Sonoff device ' + req.params.deviceId + ' can not be switched to "' + req.params.state + '", only "ON" and "OFF" are supported currently');
        }
    }
});

//get the known state of one known device
server.get('/devices/:deviceId', function (req, res) {
    log.log('GET | %s | %s ', req.method, req.url);
    var d = devices.getDeviceState(req.params.deviceId);
    if (!d || d == "disconnected") {
        res.status(404).send('Sonoff device ' + req.params.deviceId + ' not found');
    } else {
        res.json(devices.getConnectedDevices().find(d => d.id == req.params.deviceId));
    }
});

//get a list of known devices
server.get('/devices', function (req, res) {
    log.log('GET | %s | %s ', req.method, req.url);
    res.json(devices.getConnectedDevices());
});
