const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
var request = require('request');
const readline = require('readline');

var WiFiControl = require('wifi-control');

//config parameters for SONOFF
var apSSID = "ITEAD-10";
var apPWD = "12345678";

var parameterMissing = false;

//config from file
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, './sonoff.config.json')));
if (config.server == undefined) config.server = {};
if (config.router == undefined) config.router = {};

//config from environment
if (process.env.SERVER_IP !== undefined)
    config.server.IP = process.env.SERVER_IP;
if (process.env.HTTPS_PORT !== undefined)
    config.server.httpsPort = process.env.HTTPS_PORT;
if (process.env.WIFI_SSID !== undefined)
    config.router.SSID = process.env.WIFI_SSID;
if (process.env.WIFI_PASSWORD !== undefined)
    config.router.password = process.env.WIFI_PASSWORD;

if (config.server.IP == undefined) {
    console.error("IP-Adress of your Server running 'sonoff.server.js' or 'sonoff.server.module.js' is missing in the config");
    parameterMissing = true;
}
if (config.server.httpsPort == undefined) {
    console.error("Port of your Server is missing in the config");
    parameterMissing = true;
}
if (config.router.SSID == undefined) {
    console.error("SSID of the network the SONOFF devices should connect to is missing in the config");
    parameterMissing = true;
}
if (config.router.password == undefined) {
    console.error("Password for " + config.router.SSID + " is missing in the config");
    parameterMissing = true;
}

if (!parameterMissing) {
    console.log("using config: ", JSON.stringify(config));

    console.log("checking if sonoff-server is reachable...", 'https://' + config.server.IP + ':' + config.server.httpsPort + '/');
    request.get({
        url: 'https://' + config.server.IP + ':' + config.server.httpsPort + '/',
        rejectUnauthorized: false,
        requestCert: true
    }, (err, res, data) => {
        if (err) {
            console.error(`Unable to establish connection to the https sonoff-server: ${err}`);
        } else if (res.statusCode !== 200) {
            console.error('Unable to connect to the https sonoff-server: ' + res.statusCode);
        } else {
            // data is already parsed as JSON:
            console.log('Connection to the https sonoff-server was successfully established', data);
        }

        //  Initialize wifi-control package with verbose output
        WiFiControl.init({
            debug: true
        });

        //initialize the SONOFF after it has been found
        // - set the wlan-network that the sonoff should use
        // - set server to which the sonoff should connect (instead of its original cloud)
        var _initDevice = () => {
            http.get('http://10.10.7.1/device', (res) => {
                if (res.statusCode !== 200) {
                    console.log('Unable to connect to the target device. Code: ' + res.statusCode);
                    res.resume();
                    return;
                }
                res.setEncoding('utf8');
                var data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => {
                    var response = JSON.parse(data);
                    var device = {
                        deviceid: response.deviceid,
                        apikey: response.apikey
                    };

                    console.log('device: ' + JSON.stringify(device));

                    //send configuration to device, so that it will use that server as its cloud
                    request.post('http://10.10.7.1/ap', {
                        json: true, body: {
                            "version": 4,
                            "ssid": config.router.SSID,
                            "password": config.router.password,
                            "serverName": config.server.IP,
                            "port": config.server.httpsPort
                        }
                    }, (err, response, body) => {
                        if (!err && response.statusCode == 200) {
                            console.log(JSON.stringify(response) + "\t" + body);
                        }
                        else {
                            console.log('Unable to configure endpoint ' + err);
                        }
                    });
                });
            }).on('error', (e) => {
                console.log(`Unable to establish connection to the device: ${e}`);
            });
        };

        // ----------------------------------------------------------------
        // run .....
        // - scan for SONOFF wlan = ITEAD-100xxxxxx
        // - connect to SONOFF
        // - setup SONOFF to use local PC as cloud
        // -----------------------------------------------------------------
        var find = setInterval(() => {
            WiFiControl.scanForWiFi(function (err, response) {
                if (err) console.log(err);
                var apNet = response.networks.find(n => n.ssid.startsWith(apSSID));

                if (!apNet) {
                    console.log('ERR | ' + Date.now() + ' | Sonoff is not in pairing mode. Please, Long press until led start blinking fast.');
                } else {
                    console.log('OK | Sonoff found in pairing mode.');
                    apSSID = apNet.ssid;
                    clearInterval(find);
                    apNet.password = apPWD;
                    WiFiControl.connectToAP(apNet, function (err, response) {
                        if (err) console.log(err);
                        console.log('OK | Sonoff paired.', response);
                        _initDevice();
                    });
                }
            });
        }, 500);
    });
}
