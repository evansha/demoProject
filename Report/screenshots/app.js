var app = angular.module('reportingApp', []);

//<editor-fold desc="global helpers">

var isValueAnArray = function (val) {
    return Array.isArray(val);
};

var getSpec = function (str) {
    var describes = str.split('|');
    return describes[describes.length - 1];
};
var checkIfShouldDisplaySpecName = function (prevItem, item) {
    if (!prevItem) {
        item.displaySpecName = true;
    } else if (getSpec(item.description) !== getSpec(prevItem.description)) {
        item.displaySpecName = true;
    }
};

var getParent = function (str) {
    var arr = str.split('|');
    str = "";
    for (var i = arr.length - 2; i > 0; i--) {
        str += arr[i] + " > ";
    }
    return str.slice(0, -3);
};

var getShortDescription = function (str) {
    return str.split('|')[0];
};

var countLogMessages = function (item) {
    if ((!item.logWarnings || !item.logErrors) && item.browserLogs && item.browserLogs.length > 0) {
        item.logWarnings = 0;
        item.logErrors = 0;
        for (var logNumber = 0; logNumber < item.browserLogs.length; logNumber++) {
            var logEntry = item.browserLogs[logNumber];
            if (logEntry.level === 'SEVERE') {
                item.logErrors++;
            }
            if (logEntry.level === 'WARNING') {
                item.logWarnings++;
            }
        }
    }
};

var convertTimestamp = function (timestamp) {
    var d = new Date(timestamp),
        yyyy = d.getFullYear(),
        mm = ('0' + (d.getMonth() + 1)).slice(-2),
        dd = ('0' + d.getDate()).slice(-2),
        hh = d.getHours(),
        h = hh,
        min = ('0' + d.getMinutes()).slice(-2),
        ampm = 'AM',
        time;

    if (hh > 12) {
        h = hh - 12;
        ampm = 'PM';
    } else if (hh === 12) {
        h = 12;
        ampm = 'PM';
    } else if (hh === 0) {
        h = 12;
    }

    // ie: 2013-02-18, 8:35 AM
    time = yyyy + '-' + mm + '-' + dd + ', ' + h + ':' + min + ' ' + ampm;

    return time;
};

var defaultSortFunction = function sortFunction(a, b) {
    if (a.sessionId < b.sessionId) {
        return -1;
    } else if (a.sessionId > b.sessionId) {
        return 1;
    }

    if (a.timestamp < b.timestamp) {
        return -1;
    } else if (a.timestamp > b.timestamp) {
        return 1;
    }

    return 0;
};

//</editor-fold>

app.controller('ScreenshotReportController', ['$scope', '$http', 'TitleService', function ($scope, $http, titleService) {
    var that = this;
    var clientDefaults = {};

    $scope.searchSettings = Object.assign({
        description: '',
        allselected: true,
        passed: true,
        failed: true,
        pending: true,
        withLog: true
    }, clientDefaults.searchSettings || {}); // enable customisation of search settings on first page hit

    this.warningTime = 1400;
    this.dangerTime = 1900;
    this.totalDurationFormat = clientDefaults.totalDurationFormat;
    this.showTotalDurationIn = clientDefaults.showTotalDurationIn;

    var initialColumnSettings = clientDefaults.columnSettings; // enable customisation of visible columns on first page hit
    if (initialColumnSettings) {
        if (initialColumnSettings.displayTime !== undefined) {
            // initial settings have be inverted because the html bindings are inverted (e.g. !ctrl.displayTime)
            this.displayTime = !initialColumnSettings.displayTime;
        }
        if (initialColumnSettings.displayBrowser !== undefined) {
            this.displayBrowser = !initialColumnSettings.displayBrowser; // same as above
        }
        if (initialColumnSettings.displaySessionId !== undefined) {
            this.displaySessionId = !initialColumnSettings.displaySessionId; // same as above
        }
        if (initialColumnSettings.displayOS !== undefined) {
            this.displayOS = !initialColumnSettings.displayOS; // same as above
        }
        if (initialColumnSettings.inlineScreenshots !== undefined) {
            this.inlineScreenshots = initialColumnSettings.inlineScreenshots; // this setting does not have to be inverted
        } else {
            this.inlineScreenshots = false;
        }
        if (initialColumnSettings.warningTime) {
            this.warningTime = initialColumnSettings.warningTime;
        }
        if (initialColumnSettings.dangerTime) {
            this.dangerTime = initialColumnSettings.dangerTime;
        }
    }


    this.chooseAllTypes = function () {
        var value = true;
        $scope.searchSettings.allselected = !$scope.searchSettings.allselected;
        if (!$scope.searchSettings.allselected) {
            value = false;
        }

        $scope.searchSettings.passed = value;
        $scope.searchSettings.failed = value;
        $scope.searchSettings.pending = value;
        $scope.searchSettings.withLog = value;
    };

    this.isValueAnArray = function (val) {
        return isValueAnArray(val);
    };

    this.getParent = function (str) {
        return getParent(str);
    };

    this.getSpec = function (str) {
        return getSpec(str);
    };

    this.getShortDescription = function (str) {
        return getShortDescription(str);
    };
    this.hasNextScreenshot = function (index) {
        var old = index;
        return old !== this.getNextScreenshotIdx(index);
    };

    this.hasPreviousScreenshot = function (index) {
        var old = index;
        return old !== this.getPreviousScreenshotIdx(index);
    };
    this.getNextScreenshotIdx = function (index) {
        var next = index;
        var hit = false;
        while (next + 2 < this.results.length) {
            next++;
            if (this.results[next].screenShotFile && !this.results[next].pending) {
                hit = true;
                break;
            }
        }
        return hit ? next : index;
    };

    this.getPreviousScreenshotIdx = function (index) {
        var prev = index;
        var hit = false;
        while (prev > 0) {
            prev--;
            if (this.results[prev].screenShotFile && !this.results[prev].pending) {
                hit = true;
                break;
            }
        }
        return hit ? prev : index;
    };

    this.convertTimestamp = convertTimestamp;


    this.round = function (number, roundVal) {
        return (parseFloat(number) / 1000).toFixed(roundVal);
    };


    this.passCount = function () {
        var passCount = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (result.passed) {
                passCount++;
            }
        }
        return passCount;
    };


    this.pendingCount = function () {
        var pendingCount = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (result.pending) {
                pendingCount++;
            }
        }
        return pendingCount;
    };

    this.failCount = function () {
        var failCount = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (!result.passed && !result.pending) {
                failCount++;
            }
        }
        return failCount;
    };

    this.totalDuration = function () {
        var sum = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (result.duration) {
                sum += result.duration;
            }
        }
        return sum;
    };

    this.passPerc = function () {
        return (this.passCount() / this.totalCount()) * 100;
    };
    this.pendingPerc = function () {
        return (this.pendingCount() / this.totalCount()) * 100;
    };
    this.failPerc = function () {
        return (this.failCount() / this.totalCount()) * 100;
    };
    this.totalCount = function () {
        return this.passCount() + this.failCount() + this.pendingCount();
    };


    var results = [
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771098420,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771099410,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a40080-001d-00a0-00b2-004c00110049.png",
        "timestamp": 1617771096535,
        "duration": 14531
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771112476,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771112561,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005b0064-00db-00f2-0024-00c3002c0075.png",
        "timestamp": 1617771111506,
        "duration": 4548
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771116796,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771116908,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e500df-009d-0057-0049-00ed00ba0058.png",
        "timestamp": 1617771116741,
        "duration": 2624
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771120003,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00960041-00c7-00d5-0045-00a800740023.png",
        "timestamp": 1617771119821,
        "duration": 8015
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771128298,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771128409,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003c005d-0044-00b9-007f-0022006200ff.png",
        "timestamp": 1617771128154,
        "duration": 9560
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771138405,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771138545,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d9005f-00e8-00af-00b8-009700ba00af.png",
        "timestamp": 1617771138190,
        "duration": 2302
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771141120,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002b0018-00aa-0051-0001-0095007a0068.png",
        "timestamp": 1617771140862,
        "duration": 2427
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771144222,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007500bd-00be-0024-001b-00fa006600f5.png",
        "timestamp": 1617771144028,
        "duration": 3268
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771147674,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771147778,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009900e3-00dc-00c6-00d3-00a1004b0050.png",
        "timestamp": 1617771147619,
        "duration": 1614
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771149628,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771149727,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008a0025-0016-00b9-00ad-008100900019.png",
        "timestamp": 1617771149572,
        "duration": 2627
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771152602,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771152743,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00750039-003f-0042-002a-00d500b8007b.png",
        "timestamp": 1617771152512,
        "duration": 822
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771153737,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771153837,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00df0089-00cd-004f-0018-0013007c0020.png",
        "timestamp": 1617771153683,
        "duration": 5199
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771159263,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771159367,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fe0098-0073-0019-009c-006500140097.png",
        "timestamp": 1617771159203,
        "duration": 1719
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771161686,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771161790,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000e000b-009a-0005-00ea-001e002c0018.png",
        "timestamp": 1617771161296,
        "duration": 1886
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771163926,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771164021,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00520024-006f-00bd-008a-00c500f1000a.png",
        "timestamp": 1617771163502,
        "duration": 1311
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1617771165195,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771165233,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00de0052-006a-0061-00d1-00a0001d0082.png",
        "timestamp": 1617771165141,
        "duration": 1716
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771167435,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006900b0-002e-00d9-00a9-003c002900cd.png",
        "timestamp": 1617771167261,
        "duration": 1767
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 218:117 Uncaught Q: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1617771169584,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004400b1-005d-007a-009d-00d6000f00b7.png",
        "timestamp": 1617771169421,
        "duration": 1079
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1617771171312,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771171511,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771171541,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771175026,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771175026,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fb000f-00ed-002b-0055-007f00a10065.png",
        "timestamp": 1617771170938,
        "duration": 4191
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1617771176410,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771176467,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771176482,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771179774,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771179774,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000100d6-0027-0019-004b-0086006900e7.png",
        "timestamp": 1617771175689,
        "duration": 4195
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1617771180479,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771180528,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771180545,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771183726,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771183726,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002100f2-00da-009d-0077-00d100780064.png",
        "timestamp": 1617771180437,
        "duration": 3394
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1617771184442,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771184486,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771184500,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771187699,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771187699,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007f00e9-00ab-0067-00e4-00d900070054.png",
        "timestamp": 1617771184400,
        "duration": 3381
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1617771188409,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771188456,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1617771188475,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771191673,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1617771191673,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c50037-0009-0062-00db-00760050007d.png",
        "timestamp": 1617771188368,
        "duration": 3389
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00be0089-0004-0057-0017-0049007400c3.png",
        "timestamp": 1617771192329,
        "duration": 5586
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771198557,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771198557,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771198557,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1617771199717,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771199864,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771199864,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771199864,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1617771200829,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004200e2-001a-0099-009e-000800270037.png",
        "timestamp": 1617771198332,
        "duration": 2762
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 20728,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771201741,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771201741,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1617771201741,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1617771202778,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0048007e-00ac-00b6-00fa-00e60073005c.png",
        "timestamp": 1617771201483,
        "duration": 4842
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291705852,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291706630,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00070090-00d4-001d-00d2-00ed004400aa.png",
        "timestamp": 1618291700817,
        "duration": 17478
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291719038,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291719116,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ab005f-00b4-00e9-004f-00e3004d0068.png",
        "timestamp": 1618291718928,
        "duration": 3464
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291723146,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291723212,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e600b0-00d2-0035-005d-00080054007a.png",
        "timestamp": 1618291722921,
        "duration": 3353
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291726740,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291726778,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0062005a-00e2-003e-00f3-00bb000000de.png",
        "timestamp": 1618291726675,
        "duration": 10245
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291737399,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00170010-00b4-0003-0050-00750070006e.png",
        "timestamp": 1618291737229,
        "duration": 9671
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291747475,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291747689,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f1009c-00c0-00f9-00dc-000700c900f1.png",
        "timestamp": 1618291747335,
        "duration": 2971
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291750782,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291750890,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008700de-00f7-005b-0013-00120026002d.png",
        "timestamp": 1618291750654,
        "duration": 2241
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291753715,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291753777,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c60008-0080-00e0-0041-00e8008400da.png",
        "timestamp": 1618291753634,
        "duration": 3865
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291758084,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291758181,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004b0010-00f1-00cf-0063-0050009e006d.png",
        "timestamp": 1618291758023,
        "duration": 1333
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291759792,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291759890,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00620088-0057-00f5-00cf-0042005b0085.png",
        "timestamp": 1618291759729,
        "duration": 2032
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291762145,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291762243,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00560012-00ae-0049-00f3-00b3007b009e.png",
        "timestamp": 1618291762094,
        "duration": 863
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291763376,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291763484,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c4009a-00ef-0050-000e-00d300410019.png",
        "timestamp": 1618291763317,
        "duration": 3904
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291767607,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291767722,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007c00ed-00d1-0062-00ca-00b9009700b4.png",
        "timestamp": 1618291767547,
        "duration": 1639
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291769586,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291769692,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ec004f-0073-00cf-0080-00a4009400da.png",
        "timestamp": 1618291769526,
        "duration": 1599
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291771496,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291771612,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00960059-0042-0026-0034-0051000c0084.png",
        "timestamp": 1618291771443,
        "duration": 797
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": [
            "Failed: Wait timed out after 5003ms"
        ],
        "trace": [
            "TimeoutError: Wait timed out after 5003ms\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2201:17\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: <anonymous wait>\n    at scheduleWait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2188:20)\n    at ControlFlow.wait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2517:12)\n    at Driver.wait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:934:29)\n    at run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:58:33)\n    at ProtractorBrowser.to.<computed> [as wait] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:66:16)\n    at util.until (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\TestUtils.js:7:17)\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Smallprojects\\Banking\\Banking_ManagerSpec.js:24:14)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\nFrom: Task: Run it(\"Managers_addCustomers_functionality_Check\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Smallprojects\\Banking\\Banking_ManagerSpec.js:22:5)\n    at addSpecsToSuite (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Smallprojects\\Banking\\Banking_ManagerSpec.js:5:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291772636,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291772738,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00560057-000a-0033-0062-00c5006200a2.png",
        "timestamp": 1618291772580,
        "duration": 7276
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291780251,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291780324,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001900b8-0084-0052-00c8-001e001b0025.png",
        "timestamp": 1618291780166,
        "duration": 2383
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618291783093,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618291783191,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003d00e3-006f-006a-0018-0033004a00df.png",
        "timestamp": 1618291783038,
        "duration": 1731
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618291786158,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291787434,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291787463,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291794414,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291794414,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00220097-003b-0076-0015-009c00ee00d7.png",
        "timestamp": 1618291785193,
        "duration": 9333
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618291795621,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291795671,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291795687,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291798995,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291798995,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00840056-0008-0080-0036-00d100f5001e.png",
        "timestamp": 1618291795092,
        "duration": 4005
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618291799701,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291799750,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291799768,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291802974,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291802974,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ba0094-0007-006d-0091-001900710055.png",
        "timestamp": 1618291799656,
        "duration": 3405
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618291803663,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291803715,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291803732,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291806925,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291806925,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00850094-00dc-0041-00ba-00b600ca00bb.png",
        "timestamp": 1618291803626,
        "duration": 3418
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618291807884,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291807928,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618291807944,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291811128,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618291811128,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cf00f3-0052-00a9-0082-00280004005d.png",
        "timestamp": 1618291807809,
        "duration": 3409
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00d00016-00df-00fe-0014-0098007c003c.png",
        "timestamp": 1618291811787,
        "duration": 5977
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291818460,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291818461,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291818462,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618291820093,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291820238,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291820238,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291820238,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618291820816,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b000ae-002f-00e3-003d-00a70066005e.png",
        "timestamp": 1618291818242,
        "duration": 2819
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 24720,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291821672,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291821672,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618291821672,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618291839759,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002600f4-000f-00da-0071-00ec0056008e.png",
        "timestamp": 1618291821436,
        "duration": 21892
    }
];

    this.sortSpecs = function () {
        this.results = results.sort(function sortFunction(a, b) {
    if (a.sessionId < b.sessionId) return -1;else if (a.sessionId > b.sessionId) return 1;

    if (a.timestamp < b.timestamp) return -1;else if (a.timestamp > b.timestamp) return 1;

    return 0;
});

    };

    this.setTitle = function () {
        var title = $('.report-title').text();
        titleService.setTitle(title);
    };

    // is run after all test data has been prepared/loaded
    this.afterLoadingJobs = function () {
        this.sortSpecs();
        this.setTitle();
    };

    this.loadResultsViaAjax = function () {

        $http({
            url: './combined.json',
            method: 'GET'
        }).then(function (response) {
                var data = null;
                if (response && response.data) {
                    if (typeof response.data === 'object') {
                        data = response.data;
                    } else if (response.data[0] === '"') { //detect super escaped file (from circular json)
                        data = CircularJSON.parse(response.data); //the file is escaped in a weird way (with circular json)
                    } else {
                        data = JSON.parse(response.data);
                    }
                }
                if (data) {
                    results = data;
                    that.afterLoadingJobs();
                }
            },
            function (error) {
                console.error(error);
            });
    };


    if (clientDefaults.useAjax) {
        this.loadResultsViaAjax();
    } else {
        this.afterLoadingJobs();
    }

}]);

app.filter('bySearchSettings', function () {
    return function (items, searchSettings) {
        var filtered = [];
        if (!items) {
            return filtered; // to avoid crashing in where results might be empty
        }
        var prevItem = null;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            item.displaySpecName = false;

            var isHit = false; //is set to true if any of the search criteria matched
            countLogMessages(item); // modifies item contents

            var hasLog = searchSettings.withLog && item.browserLogs && item.browserLogs.length > 0;
            if (searchSettings.description === '' ||
                (item.description && item.description.toLowerCase().indexOf(searchSettings.description.toLowerCase()) > -1)) {

                if (searchSettings.passed && item.passed || hasLog) {
                    isHit = true;
                } else if (searchSettings.failed && !item.passed && !item.pending || hasLog) {
                    isHit = true;
                } else if (searchSettings.pending && item.pending || hasLog) {
                    isHit = true;
                }
            }
            if (isHit) {
                checkIfShouldDisplaySpecName(prevItem, item);

                filtered.push(item);
                prevItem = item;
            }
        }

        return filtered;
    };
});

//formats millseconds to h m s
app.filter('timeFormat', function () {
    return function (tr, fmt) {
        if(tr == null){
            return "NaN";
        }

        switch (fmt) {
            case 'h':
                var h = tr / 1000 / 60 / 60;
                return "".concat(h.toFixed(2)).concat("h");
            case 'm':
                var m = tr / 1000 / 60;
                return "".concat(m.toFixed(2)).concat("min");
            case 's' :
                var s = tr / 1000;
                return "".concat(s.toFixed(2)).concat("s");
            case 'hm':
            case 'h:m':
                var hmMt = tr / 1000 / 60;
                var hmHr = Math.trunc(hmMt / 60);
                var hmMr = hmMt - (hmHr * 60);
                if (fmt === 'h:m') {
                    return "".concat(hmHr).concat(":").concat(hmMr < 10 ? "0" : "").concat(Math.round(hmMr));
                }
                return "".concat(hmHr).concat("h ").concat(hmMr.toFixed(2)).concat("min");
            case 'hms':
            case 'h:m:s':
                var hmsS = tr / 1000;
                var hmsHr = Math.trunc(hmsS / 60 / 60);
                var hmsM = hmsS / 60;
                var hmsMr = Math.trunc(hmsM - hmsHr * 60);
                var hmsSo = hmsS - (hmsHr * 60 * 60) - (hmsMr*60);
                if (fmt === 'h:m:s') {
                    return "".concat(hmsHr).concat(":").concat(hmsMr < 10 ? "0" : "").concat(hmsMr).concat(":").concat(hmsSo < 10 ? "0" : "").concat(Math.round(hmsSo));
                }
                return "".concat(hmsHr).concat("h ").concat(hmsMr).concat("min ").concat(hmsSo.toFixed(2)).concat("s");
            case 'ms':
                var msS = tr / 1000;
                var msMr = Math.trunc(msS / 60);
                var msMs = msS - (msMr * 60);
                return "".concat(msMr).concat("min ").concat(msMs.toFixed(2)).concat("s");
        }

        return tr;
    };
});


function PbrStackModalController($scope, $rootScope) {
    var ctrl = this;
    ctrl.rootScope = $rootScope;
    ctrl.getParent = getParent;
    ctrl.getShortDescription = getShortDescription;
    ctrl.convertTimestamp = convertTimestamp;
    ctrl.isValueAnArray = isValueAnArray;
    ctrl.toggleSmartStackTraceHighlight = function () {
        var inv = !ctrl.rootScope.showSmartStackTraceHighlight;
        ctrl.rootScope.showSmartStackTraceHighlight = inv;
    };
    ctrl.applySmartHighlight = function (line) {
        if ($rootScope.showSmartStackTraceHighlight) {
            if (line.indexOf('node_modules') > -1) {
                return 'greyout';
            }
            if (line.indexOf('  at ') === -1) {
                return '';
            }

            return 'highlight';
        }
        return '';
    };
}


app.component('pbrStackModal', {
    templateUrl: "pbr-stack-modal.html",
    bindings: {
        index: '=',
        data: '='
    },
    controller: PbrStackModalController
});

function PbrScreenshotModalController($scope, $rootScope) {
    var ctrl = this;
    ctrl.rootScope = $rootScope;
    ctrl.getParent = getParent;
    ctrl.getShortDescription = getShortDescription;

    /**
     * Updates which modal is selected.
     */
    this.updateSelectedModal = function (event, index) {
        var key = event.key; //try to use non-deprecated key first https://developer.mozilla.org/de/docs/Web/API/KeyboardEvent/keyCode
        if (key == null) {
            var keyMap = {
                37: 'ArrowLeft',
                39: 'ArrowRight'
            };
            key = keyMap[event.keyCode]; //fallback to keycode
        }
        if (key === "ArrowLeft" && this.hasPrevious) {
            this.showHideModal(index, this.previous);
        } else if (key === "ArrowRight" && this.hasNext) {
            this.showHideModal(index, this.next);
        }
    };

    /**
     * Hides the modal with the #oldIndex and shows the modal with the #newIndex.
     */
    this.showHideModal = function (oldIndex, newIndex) {
        const modalName = '#imageModal';
        $(modalName + oldIndex).modal("hide");
        $(modalName + newIndex).modal("show");
    };

}

app.component('pbrScreenshotModal', {
    templateUrl: "pbr-screenshot-modal.html",
    bindings: {
        index: '=',
        data: '=',
        next: '=',
        previous: '=',
        hasNext: '=',
        hasPrevious: '='
    },
    controller: PbrScreenshotModalController
});

app.factory('TitleService', ['$document', function ($document) {
    return {
        setTitle: function (title) {
            $document[0].title = title;
        }
    };
}]);


app.run(
    function ($rootScope, $templateCache) {
        //make sure this option is on by default
        $rootScope.showSmartStackTraceHighlight = true;
        
  $templateCache.put('pbr-screenshot-modal.html',
    '<div class="modal" id="imageModal{{$ctrl.index}}" tabindex="-1" role="dialog"\n' +
    '     aria-labelledby="imageModalLabel{{$ctrl.index}}" ng-keydown="$ctrl.updateSelectedModal($event,$ctrl.index)">\n' +
    '    <div class="modal-dialog modal-lg m-screenhot-modal" role="document">\n' +
    '        <div class="modal-content">\n' +
    '            <div class="modal-header">\n' +
    '                <button type="button" class="close" data-dismiss="modal" aria-label="Close">\n' +
    '                    <span aria-hidden="true">&times;</span>\n' +
    '                </button>\n' +
    '                <h6 class="modal-title" id="imageModalLabelP{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getParent($ctrl.data.description)}}</h6>\n' +
    '                <h5 class="modal-title" id="imageModalLabel{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getShortDescription($ctrl.data.description)}}</h5>\n' +
    '            </div>\n' +
    '            <div class="modal-body">\n' +
    '                <img class="screenshotImage" ng-src="{{$ctrl.data.screenShotFile}}">\n' +
    '            </div>\n' +
    '            <div class="modal-footer">\n' +
    '                <div class="pull-left">\n' +
    '                    <button ng-disabled="!$ctrl.hasPrevious" class="btn btn-default btn-previous" data-dismiss="modal"\n' +
    '                            data-toggle="modal" data-target="#imageModal{{$ctrl.previous}}">\n' +
    '                        Prev\n' +
    '                    </button>\n' +
    '                    <button ng-disabled="!$ctrl.hasNext" class="btn btn-default btn-next"\n' +
    '                            data-dismiss="modal" data-toggle="modal"\n' +
    '                            data-target="#imageModal{{$ctrl.next}}">\n' +
    '                        Next\n' +
    '                    </button>\n' +
    '                </div>\n' +
    '                <a class="btn btn-primary" href="{{$ctrl.data.screenShotFile}}" target="_blank">\n' +
    '                    Open Image in New Tab\n' +
    '                    <span class="glyphicon glyphicon-new-window" aria-hidden="true"></span>\n' +
    '                </a>\n' +
    '                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </div>\n' +
    '</div>\n' +
     ''
  );

  $templateCache.put('pbr-stack-modal.html',
    '<div class="modal" id="modal{{$ctrl.index}}" tabindex="-1" role="dialog"\n' +
    '     aria-labelledby="stackModalLabel{{$ctrl.index}}">\n' +
    '    <div class="modal-dialog modal-lg m-stack-modal" role="document">\n' +
    '        <div class="modal-content">\n' +
    '            <div class="modal-header">\n' +
    '                <button type="button" class="close" data-dismiss="modal" aria-label="Close">\n' +
    '                    <span aria-hidden="true">&times;</span>\n' +
    '                </button>\n' +
    '                <h6 class="modal-title" id="stackModalLabelP{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getParent($ctrl.data.description)}}</h6>\n' +
    '                <h5 class="modal-title" id="stackModalLabel{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getShortDescription($ctrl.data.description)}}</h5>\n' +
    '            </div>\n' +
    '            <div class="modal-body">\n' +
    '                <div ng-if="$ctrl.data.trace.length > 0">\n' +
    '                    <div ng-if="$ctrl.isValueAnArray($ctrl.data.trace)">\n' +
    '                        <pre class="logContainer" ng-repeat="trace in $ctrl.data.trace track by $index"><div ng-class="$ctrl.applySmartHighlight(line)" ng-repeat="line in trace.split(\'\\n\') track by $index">{{line}}</div></pre>\n' +
    '                    </div>\n' +
    '                    <div ng-if="!$ctrl.isValueAnArray($ctrl.data.trace)">\n' +
    '                        <pre class="logContainer"><div ng-class="$ctrl.applySmartHighlight(line)" ng-repeat="line in $ctrl.data.trace.split(\'\\n\') track by $index">{{line}}</div></pre>\n' +
    '                    </div>\n' +
    '                </div>\n' +
    '                <div ng-if="$ctrl.data.browserLogs.length > 0">\n' +
    '                    <h5 class="modal-title">\n' +
    '                        Browser logs:\n' +
    '                    </h5>\n' +
    '                    <pre class="logContainer"><div class="browserLogItem"\n' +
    '                                                   ng-repeat="logError in $ctrl.data.browserLogs track by $index"><div><span class="label browserLogLabel label-default"\n' +
    '                                                                                                                             ng-class="{\'label-danger\': logError.level===\'SEVERE\', \'label-warning\': logError.level===\'WARNING\'}">{{logError.level}}</span><span class="label label-default">{{$ctrl.convertTimestamp(logError.timestamp)}}</span><div ng-repeat="messageLine in logError.message.split(\'\\\\n\') track by $index">{{ messageLine }}</div></div></div></pre>\n' +
    '                </div>\n' +
    '            </div>\n' +
    '            <div class="modal-footer">\n' +
    '                <button class="btn btn-default"\n' +
    '                        ng-class="{active: $ctrl.rootScope.showSmartStackTraceHighlight}"\n' +
    '                        ng-click="$ctrl.toggleSmartStackTraceHighlight()">\n' +
    '                    <span class="glyphicon glyphicon-education black"></span> Smart Stack Trace\n' +
    '                </button>\n' +
    '                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </div>\n' +
    '</div>\n' +
     ''
  );

    });
