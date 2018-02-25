# Simple SONOFF Server
Current State => Not finished yet, but works most of the time.

A lot of this code is based on the findings in this blog
http://blog.nanl.de/2017/05/sonota-flashing-itead-sonoff-devices-via-original-ota-mechanism/
and
https://blog.ipsumdomus.com/sonoff-switch-complete-hack-without-firmware-upgrade-1b2d6632c01

The idea was to have an Openhab Binding. And this is the concept implementation, that works good enough for me to start with. It can be used in combination with the HTTP Binding.

# Configuration

I suggest to use => https://github.com/saryn/node-red-contrib-sonoff-server
It solves a lot of problems like taking care of starting/stoping the server or keeping it running.

If you still want to use this directly:

Change the sonoff.config.json to fit your environment.

The "server" is the device, which should stay in contact with the SONOFF devices. In my case it was the Raspverry Pi, which also runs Openhab.

* "httpsPort" can be any port.
* "websocketPort" can be any port.

But make sure, that your router is allowing communication between devices.

```json
{
    "router": {
        "SSID": "##########",
        "password": "###########"
    },
    "server": {
        "IP": "0.0.0.0",
        "httpPort": 1080,
        "httpsPort": 1081,
        "websocketPort": 443
    }
}
```

# Setup a new device
There are two ways of setting up the devices. Either with the sonoff.setupdevice.js script, or with wget (or anything else that can post an http request to a specific server).

### sonoff.setupdevice.js
Start sonoff.setupdevice.js on a computer you like. It will connect to the SONOFF device, so you will lose internet connection. When the scripts runs, you must long-click the black button on the device, and it will be configured to use the "server" as its cloud. Which now runs in your own network.

To run this on a linux device, the network manager must be installed. On an raspberry pi I would suggest to do the setup process manually with wget.

### wget
(thanks @andrewerrington)
1. Put the SonOff/Wemos device in AP mode (press and hold button for 5s)
1. Find the device and connect to it (SSID: ITEAD-10000xxxxx Password: 12345678)
1. Add route if necessary `sudo route change 0.0.0.0 mask 0.0.0.0 10.10.7.1`
1. (optional) use wget to read device info `wget -O- 10.10.7.1/device`
1. use wget to send local WiFi settings to device `wget -O- --post-data='{"version":4,"ssid":"yourSSID","password":"yourSSID_PASSWORD","serverName":"n.n.n.n","port":1081}' --header=Content-Type:application/json "http://10.10.7.1/ap"`

The device will automatically drop out of AP mode and tries to connect to WiFi and server.

# running the server
Start sonoff.server.js 
This Server keeps the connection to the sonoff devices, and must run permanently.

* /devices => list off all devices that are currently known to the server.
* /devices/:deviceId/status => shows the status of the device 
* /devices/:deviceId/on => turns the device "on" 
* /devices/:deviceId/off => turns the device "off" 
