# Simple SONOFF Server
========================
Current State => Not finished yet.

A lot of this code is based on the findings in this blog
http://blog.nanl.de/2017/05/sonota-flashing-itead-sonoff-devices-via-original-ota-mechanism/
and
https://blog.ipsumdomus.com/sonoff-switch-complete-hack-without-firmware-upgrade-1b2d6632c01

The idea was to have an Openhab Binding. And this is the concept implementation, that works good enough for me to start with. It can be used in combination with the HTTP Binding.

# Configuration
Change the sonoff.config.json to fit your environment.

The "server" is the device, which should stay in contact with the SONOFF devices. In my case it was the Raspverry Pi, which also runs Openhab.

"httpsPort" can be any port.
"websocketPort" can be any port.
But make sure, that your router is allowing communication between devices.

{
    "router": {
        "SSID": "#############",
        "password": ""#############"
        
    },
    "server": {
        "IP": "192.168.178.##",
        "httpsPort": 80,
        "websocketPort": 443
    }
}

# Setup a new device
Start sonoff.setupdevice.js on a computer you like. It will connect to the SONOFF device, so you will lose internet connection. When the scripts runs, you must long-click the black button on the device, and it will be configured to use the "server" as its cloud. Which now runs in your own network.

# running the server
Start sonoff.server.js 
This Server keeps the connection to the sonoff devices, and must run permanently.

/devices => list off all devices that are currently known to the server.
/devices/:deviceId => shows the status of the device 
/devices/:deviceId/on => turns the device "on" 
/devices/:deviceId/off => turns the device "on" 
