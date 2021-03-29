var express = require('express')
const https = require('https')
const fs = require('fs');
const irsdk = require('node-irsdk');
const helpers = require('./src/helpers.js');

var options = {
    key: fs.readFileSync('./security/server.key'),
    cert: fs.readFileSync('./security/server.cert')
};

var app = express();
var server = https.createServer(options, app);
var expressWs = require('express-ws')(app, server);


let iRacingConnected = false;

irsdk.init({
    telemetryUpdateInterval: 100,
    sessionInfoUpdateInterval: 100
})

var iracing = irsdk.getInstance();

console.log('waiting for iRacing...');

iracing.on('Connected', function () {
    iRacingConnected = true;
    console.log('connected to iRacing..')
})
iracing.on('Disconnected', function () {
    iRacingConnected = false;
    console.log('iRacing shut down.\n');
    ws.emit("iRacingDisconnected");
})

let DriverNames = [];

iracing.once('SessionInfo', function (sessionInfo) {
    console.log('SessionInfo event received\n');
    sessionInfo.data.DriverInfo.Drivers.forEach(Driver => {
        DriverNames.push({
            "Idx": Driver.CarIdx,
            "Name": Driver.UserName,
            "CarNumber": Driver.CarNumber,
            "CarName": Driver.CarScreenNameShort,
            "IRating": Driver.IRating,
            "LicenceString": Driver.LicString,
            "PaceCar": Driver.CarIsPaceCar
        });
    });
    iracing.emit("SessionReady");
});

let expressData;
let playerPositions = [];

iracing.once('SessionReady', function () {
    iracing.on('Telemetry', function (data) {
        // console.clear();
        const val = data.values;


        DriverNames.forEach((x, y)=> {
            x["Position"] = val.CarIdxPosition[x.Idx]
            if (x.PaceCar == 0) {
                playerPositions[y] = x;
            }
        })
        playerPositions.sort((x, y) => x.Position - y.Position);
        const Clutch = Math.abs(val.Clutch * 100 - 100); 
        const formattedData = {
            "Steering": (val.SteeringWheelAngle * 180 / Math.PI).toFixed(1),
            "Throttle": `${(val.Throttle * 100).toFixed(0)}`,
            "Brake": `${(val.Brake * 100).toFixed(0)}`,
            "ClutchEngagement": `${Clutch.toFixed(0)}`,
            "Gear": val.Gear.toFixed(0),
            "ShiftIndicator": `${(val.ShiftIndicatorPct * 100).toFixed(0)}`,
            "RPMs": val.RPM.toFixed(0),
            "SpeedMPH": (val.Speed * 2.237).toFixed(0),
            "SpeedKPH": (val.Speed * 3.6).toFixed(0),
            "Fuel": val.FuelLevelPct,
            "Position": "P" + val.PlayerCarPosition,
            "ClassPosition": "P" + val.PlayerCarClassPosition,
            "LapPercentDone": `${(val.LapDistPct * 100).toFixed(0)}%`,
            "lapData": {
                "Lap": val.RaceLaps, "Best": val.LapBestLapTime, "Last": val.LapLastLapTime, "Current": val.LapCurrentLapTime
            },
            "aux": {
                "SessionFlags": val.SessionFlags,
                "OnTrack": val.IsOnTrackCar,
                "InGarage": val.IsInGarage,
                "Remaining": helpers.format(val.SessionTimeRemain),
                "isReplay": val.IsReplayPlaying
            }
        }
        expressData = formattedData;
    });
});

app.ws('/data', function(ws, req) {
    if (iRacingConnected) {
        let messageInterval;
        ws.on("close", (ws)=> {
            clearInterval(messageInterval)
        })
        ws.on("connectFailed", (ws)=> {
            clearInterval(messageInterval)
        })
        ws.on("error", (ws)=> {
            clearInterval(messageInterval)
        })

        ws.on('message', function(msg) {
            if (msg && (parseInt(msg) >= 50)){
                messageInterval = setInterval(()=> {
                    ws.send(JSON.stringify(expressData, null, 2));
                }, msg)
            } else {
                clearInterval(messageInterval);
                ws.send(JSON.stringify({"Msg": "Polling reset"}, null, 2));
            }
        });
    } 
    else {
        ws.on('connection', function connection(ws) {
            ws.on('connect'), function(){
                ws.send(JSON.stringify({"Msg": "iRacing Is not connected"}, null, 2));
            }
        });
    }
});

app.use(express.static('src'))

server.listen(8080); // get creative