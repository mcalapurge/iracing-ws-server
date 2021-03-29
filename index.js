var express = require('express')
var app = express();
var expressWs = require('express-ws')(app);
const fs = require('fs');
const irsdk = require('node-irsdk');
const helpers = require('./src/helpers.js');


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

        const formattedData = {
            "Steering": (val.SteeringWheelAngle * 180 / Math.PI).toFixed(1),
            "Throttle": `${(val.Throttle * 100).toFixed(0)}%`,
            "Brake": `${(val.Brake * 100).toFixed(0)}%`,
            "ClutchEngagement": `${(val.Clutch * 100).toFixed(0)}%`,
            "Gear": val.Gear.toFixed(0),
            "ShiftIndicator": `${(val.ShiftIndicatorPct * 100).toFixed(0)}%`,
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

app.get('/data', function (req, res) {
    if (iRacingConnected) {
        res.send(JSON.stringify(expressData, null, 2));
    } else {
        res.send(JSON.stringify({"Msg": "iRacing Is not connected"}, null, 2));
    }
})

app.ws('/telem', function(ws, req) {
    if (iRacingConnected) {

        ws.on('message', function(msg) {
            let messageInterval;
            if (parseInt(msg)){
                messageInterval = setInterval(()=> {
                    ws.send(JSON.stringify(expressData, null, 2));
                }, msg)
            }
        });
    } else {
        ws.on('connect'), function(){
            ws.send(JSON.stringify({"Msg": "iRacing Is not connected"}, null, 2));
        }
    }
});

app.ws('/positions', function(ws, req) {
    if (iRacingConnected) {

        ws.on('message', function(msg) {
            if (parseInt(msg)){
                let messageInterval;
                messageInterval = setInterval(()=> {
                    ws.send(JSON.stringify(playerPositions, null, 2));
                }, msg)
            }
        });
    } else {
        ws.on('connect'), function(){
            ws.send(JSON.stringify({"Msg": "iRacing Is not connected"}, null, 2));
        }
    }
});

app.listen(8080);
