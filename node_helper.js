const NodeHelper = require('node_helper');
const Log = require("logger");

module.exports = NodeHelper.create({
    start() {
        Log.info(`Starting module: ${this.name} with identifier: ${this.identifier}`);

        this.apiKey = null;

        this.outstandingTrainTimeRequest = false;
        this.outstandingBusTimeRequest = false;
        this.outstandingTrainIncidentRequest = false;
        this.outstandingBusIncidentRequest = false;
    },

    socketNotificationReceived(notification, payload) {
        switch (notification) {
            case "WMATA_INIT":
                this.apiKey = payload.apiKey;

                this.initComplete(payload);
                break;
            case "WMATA_TRAIN_TIMES_GET":
                this.getTrainTimes(payload);
                break;

            case "WMATA_BUS_TIMES_GET":
                this.getBusTimes(payload);
                break;

            case "WMATA_TRAIN_INCIDENTS_GET":
                this.getTrainIncidents(payload);
                break;

            case "WMATA_BUS_INCIDENTS_GET":
                this.getBusIncidents(payload);
                break;
        }

    },

    initComplete(payload) {
        this.sendSocketNotification("WMATA_INITIALIZED", {
            identifier: payload.identifier
        });
    },

    getTrainTimes(payload) {
        const trainQuery = payload.stations.join(",");

        const url = `https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${trainQuery}`;

        fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (!data || !data['Trains']) {
                    Log.error(`Invalid train data received: ${JSON.stringify(data)}`);
                    return;
                }

                const trainDataRaw = data['Trains'];
                const trainDataFormatted = trainDataRaw.map((trainData) => this.formatTrainData(trainData));
                this.sendSocketNotification("WMATA_TRAIN_TIMES_DATA", {
                    identifier: payload.identifier,
                    trainData: trainDataFormatted,
                });
            })
            .catch((error) => {
                Log.error(`Error fetching train times: ${error}`);
            });
    },

    formatTrainData(data) {
        return {
            ...data,
            ...{'MinNumber': this.normalizeTrainMinutes(data['Min']) }
        };
    },

    normalizeTrainMinutes(value) {
        if (value === 'BRD' || value === 'ARR') {
            return 0;
        } else if (value === "---" || value === null) {
            return -1;
        } else {
            return parseInt(value);
        }
    },

    getBusTimes(payload) {
        console.debug(payload.busStops);
        const busPredictions = {};

        const busFetches = payload.busStops.map(stopID => this.getBusStopPrediction(stopID));

        Promise.all(busFetches)
            .then(responses => {
                responses.map((r) => {
                    busPredictions[r.stopID] = r;
                });
            })
            .then(() => {
                console.debug(busPredictions);
            })
            .then(() => {
                this.sendSocketNotification("WMATA_BUS_TIMES_DATA", {
                    identifier: payload.identifier,
                    busPredictions
                });
            })
            .catch((error) => {
                Log.error(`Error fetching bus times: ${error}`);
            });
    },

    getBusStopPrediction(stopID) {
        const url = `https://api.wmata.com/NextBusService.svc/json/jPredictions?StopID=${stopID}`;

        return fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                const stopPredictions = data['Predictions'];

                return { stopID: stopID,
                         predictions: stopPredictions,
                         locationName: data['StopName']};
            })
            .catch((error) => {
                Log.error(`Error fetching bus stop prediction for ${stopID}: ${error}`);
                return { stopID: stopID, predictions: [], locationName: "Error" };
            });
    },

    getTrainIncidents(payload) {
        const url = "https://api.wmata.com/Incidents.svc/json/Incidents";
        
        fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                const incidents = data['Incidents'];
                
                this.sendSocketNotification("WMATA_TRAIN_INCIDENTS_DATA", {
                    identifier: payload.identifier,
                    incidents: incidents,
                });
            })
            .catch((error) => {
                Log.error(`Error fetching train incidents: ${error}`);
            });
    },

    getBusIncidents(payload) {
        const url = "https://api.wmata.com/Incidents.svc/json/BusIncidents";
        
        fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                const incidents = data['Incidents'];
                
                this.sendSocketNotification("WMATA_BUS_INCIDENTS_DATA", {
                    identifier: payload.identifier,
                    incidents: incidents,
                });
            })
            .catch((error) => {
                Log.error(`Error fetching bus incidents: ${error}`);
            });
    }
});
