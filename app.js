const express = require("express");
const app = express();
const multer = require('multer');
const request = require("request");
const bodyParser = require("body-parser");
const json2csv = require("json2csv").parse;
const path = require("path");
const csvtojson = require('csvtojson');
const fs = require('fs');

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

var storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, path.join(__dirname, './uploads'));
    },
    filename: function (req, file, callback) {
        callback(null, file.originalname);
    }
});

var upload = multer({ storage: storage }).single('csvfile');

app.get("/", function (req, res) {
    res.render("trial");
});

app.post("/", upload, async function (req, res) {
    let currency = req.body.currency;
    try {
        var csvFilePath = `${__dirname}\\uploads\\` + req.file.originalname;
        var jsonArray = await csvtojson().fromFile(csvFilePath);

        jsonArray = jsonArray.filter(validateRecords);
        
        var appid = "bb5823aeabe44598832e33b484f2eee9";
        var url = "https://openexchangerates.org/api/latest.json?app_id=" + appid;
        
        request(url, function (error, response, data) {
            if (!error && response.statusCode == 200) {
                let exchange = JSON.parse(data);
                let rates = exchange.rates;
                let base = exchange.base;
                let convertedRecords = jsonArray.map(record => {
                    let factor = 1;
                    if(base == currency) {
                        factor = rates[record["Donation Currency"]];
                    } else {
                        factor = rates[record["Donation Currency"]] / rates[currency];
                    }
                    let amount = parseFloat(record['Donation Amount'].replace(/,/gi, ''));
                    amount /= factor;
                    record['Donation Amount'] = amount;
                    record['Fee'] = parseFloat(record['Fee'].replace(/,/gi, ''));
                    return record;
                });

                let groupedData = convertedRecords.reduce((group, curr) => {
                    if (group[curr["Nonprofit"]]) {
                        group[curr["Nonprofit"]]["Donation Amount"] += curr["Donation Amount"];
                        group[curr["Nonprofit"]]["Fee"] += curr["Fee"];
                    } else {
                        group[curr["Nonprofit"]] = curr;
                    }
                    return group;
                }, {});

                var records = jsonToArray(groupedData);
                
                let csv = json2csv(records);
                fs.writeFile('output.csv', csv, function(err) {
                    if (err) throw err;
                    res.download('output.csv');
                });
            }
        });

    } catch (err) {
        console.error(err);
        res.send("Something went wrong!")
    }
});

const validateRecords = (record) => {
    return hasFieldAndValueString(record, 'Date') && hasFieldAndValueString(record, 'Order Id')
        && hasFieldAndValueString(record, 'Nonprofit') && hasFieldAndValueString(record, 'Donation Currency')
        && hasFieldAndValueString(record, 'Donation Amount');
}

const hasFieldAndValueString = (obj, key) => {
    if (!obj[key]) {
        return false;
    }
    let str = obj[key];
    if (typeof str === "string") {
        return str.length > 0;
    }
    return false;
}

const jsonToArray = (obj) => {
    let records = [];
    for(let id in obj) {
        records.push(obj[id]);
    }
    return records;
}

app.listen(3000, function () {
    console.log("Server has started");
});