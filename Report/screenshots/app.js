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
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311415764,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311416454,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0074009a-0069-00bd-00bf-00a900da0034.png",
        "timestamp": 1618311414133,
        "duration": 15583
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311430558,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311430678,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006d0012-002a-002f-0007-003c00870042.png",
        "timestamp": 1618311430492,
        "duration": 2600
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311433425,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311433515,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b900c9-0079-00f6-0051-0029005d00bc.png",
        "timestamp": 1618311433373,
        "duration": 2238
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311435970,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311436087,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00360095-00c9-0043-00bf-0022005f00ff.png",
        "timestamp": 1618311435907,
        "duration": 8257
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311444483,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311444548,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00880031-00b9-0010-00ed-001500ab00de.png",
        "timestamp": 1618311444428,
        "duration": 10160
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311454902,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311455022,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003a009f-0096-0065-0062-00f600a000e2.png",
        "timestamp": 1618311454849,
        "duration": 3523
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311458739,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311458804,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d3001b-00ac-0011-00d2-00a900f20067.png",
        "timestamp": 1618311458687,
        "duration": 3442
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311462838,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311462910,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000100a7-006d-004c-0005-00e6003a0099.png",
        "timestamp": 1618311462787,
        "duration": 3510
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311466591,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311466682,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000900ee-0064-002f-0002-001c001600a5.png",
        "timestamp": 1618311466555,
        "duration": 1369
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": false,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": [
            "Expected '0 + 0 = 0' to equal '10 - 6 = 4'.",
            "Expected '0 + 0 = 0' to equal '11 + 6 = 17'."
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Smallprojects\\Simplecalculator.js:52:54)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Smallprojects\\Simplecalculator.js:65:56)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311468247,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311468400,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00810053-005c-003e-004c-0038008f00ae.png",
        "timestamp": 1618311468209,
        "duration": 3588
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311472179,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311472214,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00eb006e-0078-00a3-00c5-008300080093.png",
        "timestamp": 1618311472129,
        "duration": 1092
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311473522,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311473617,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e2004c-00ed-00e5-0023-00e5000d0022.png",
        "timestamp": 1618311473477,
        "duration": 4476
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311478256,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311478344,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002200ac-0085-00a4-0076-00a400970035.png",
        "timestamp": 1618311478216,
        "duration": 1713
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311480262,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311480357,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003f00d0-004e-0015-00cd-006a000f0091.png",
        "timestamp": 1618311480208,
        "duration": 2791
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311483319,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311483409,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0005003b-0058-006c-007c-00ee00cb005f.png",
        "timestamp": 1618311483280,
        "duration": 738
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311484355,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311484444,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f800f7-0099-00ad-0032-002100db00dd.png",
        "timestamp": 1618311484316,
        "duration": 5381
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311490020,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311490111,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00dd00c6-0024-004d-005e-003600e000ee.png",
        "timestamp": 1618311489978,
        "duration": 4993
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618311495321,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618311495432,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00980037-00e4-00e4-00ef-003c002a0030.png",
        "timestamp": 1618311495288,
        "duration": 4178
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": false,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": [
            "Expected '' to equal 'FEATURES'.",
            "Failed: No element found using locator: By(css selector, a[title='Docs.'])"
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:12:45)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "NoSuchElementError: No element found using locator: By(css selector, a[title='Docs.'])\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:814:27\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as getText] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as getText] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:13:31)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Navigation-Bar Assert\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:11:7)\n    at addSpecsToSuite (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:2:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618311500042,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311500186,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311500214,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311504695,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311504695,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00eb00ce-0003-005e-004a-00e000a200da.png",
        "timestamp": 1618311499731,
        "duration": 5184
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618311505972,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311506015,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311506028,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311509331,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311509331,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000e005e-00d1-0060-0002-006700db00a8.png",
        "timestamp": 1618311505319,
        "duration": 4181
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618311509910,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311509981,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311510008,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311513241,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311513241,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0031009e-0082-0060-00fd-003f007d009f.png",
        "timestamp": 1618311509858,
        "duration": 3495
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311513756,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311513803,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311513821,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311517026,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311517026,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007b00a9-0047-005e-007b-006e00a8005b.png",
        "timestamp": 1618311513709,
        "duration": 3434
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
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
                "timestamp": 1618311517561,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311517599,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618311517614,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311520807,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618311520807,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00790020-0044-00a4-0006-00060076000c.png",
        "timestamp": 1618311517512,
        "duration": 3408
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00bc007c-00ba-00c3-008c-007200c5006b.png",
        "timestamp": 1618311521281,
        "duration": 5439
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311527291,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311527291,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311527291,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618311527913,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311528057,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311528058,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311528058,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618311528139,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002200d7-0066-00b0-002a-004300c9004e.png",
        "timestamp": 1618311527038,
        "duration": 1409
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "84243d2d9b0ecc22ce8a4faf94949ca2",
        "instanceId": 14144,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311528977,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311528977,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618311528977,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618311529573,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bc00fa-00c1-003d-0004-009a003c006c.png",
        "timestamp": 1618311528741,
        "duration": 4562
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319884587,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319885023,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008d0012-00d4-00ad-0090-0007001a00a7.png",
        "timestamp": 1618319882582,
        "duration": 16282
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319901351,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319901500,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007b0084-009d-0002-004f-0024001a001f.png",
        "timestamp": 1618319901221,
        "duration": 4283
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319907018,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319907082,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006b0032-00a0-00d2-00c4-002e003800d2.png",
        "timestamp": 1618319906921,
        "duration": 2535
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319911115,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319911176,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e700aa-0051-00cc-0001-002500a80026.png",
        "timestamp": 1618319911018,
        "duration": 8443
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319919920,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319919975,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0022005d-00bc-00c9-0066-00d0006200f0.png",
        "timestamp": 1618319919811,
        "duration": 10169
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319930388,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319930486,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007700a7-002c-0087-0012-0099005e00d4.png",
        "timestamp": 1618319930328,
        "duration": 5332
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319936103,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319936205,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005300c6-00ed-006a-005d-0085005700ce.png",
        "timestamp": 1618319936032,
        "duration": 2928
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319940096,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319940213,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b500fe-00bf-00bb-00e6-000900930083.png",
        "timestamp": 1618319939992,
        "duration": 3987
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319944402,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319944502,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005700b5-0006-0076-00e8-003700fc007e.png",
        "timestamp": 1618319944321,
        "duration": 1941
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319946677,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319946770,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d60014-00e2-00ae-0074-0003001100a7.png",
        "timestamp": 1618319946618,
        "duration": 4264
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319951465,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00330085-006f-006f-001d-001d004800a5.png",
        "timestamp": 1618319951247,
        "duration": 1448
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618319953244,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319953405,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002d0081-007a-0035-0030-0055008c0029.png",
        "timestamp": 1618319953080,
        "duration": 5771
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618319959251,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319959376,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a3008a-00fc-0044-00b7-001300cc004a.png",
        "timestamp": 1618319959187,
        "duration": 2417
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618319962020,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319962241,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006e0045-00f8-00e6-0019-0012006e0042.png",
        "timestamp": 1618319961950,
        "duration": 3257
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319965599,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319965695,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bf00b5-00dd-0093-006b-009600bc00d3.png",
        "timestamp": 1618319965529,
        "duration": 1040
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618319966966,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319967061,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003100aa-00e1-000a-00fc-003800b700d0.png",
        "timestamp": 1618319966909,
        "duration": 5334
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618319972704,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319972804,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008a0080-00aa-00f7-000c-000900bd004b.png",
        "timestamp": 1618319972633,
        "duration": 5130
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618319978280,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618319978351,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00520041-00c7-0084-00ff-009e00980070.png",
        "timestamp": 1618319978177,
        "duration": 4885
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
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
                "timestamp": 1618319984044,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319984325,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319984354,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618319988905,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618319988905,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007e00ee-0033-0025-005f-000100280093.png",
        "timestamp": 1618319983530,
        "duration": 5512
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618319990459,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319990522,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319990538,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618319993858,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618319993858,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002b00ed-00cb-00c0-0007-00ee007500da.png",
        "timestamp": 1618319989687,
        "duration": 4487
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618319994852,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319994907,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319994924,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618319998149,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618319998149,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cc0061-009e-0033-0075-0070003a00f5.png",
        "timestamp": 1618319994801,
        "duration": 3474
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319999007,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618319999030,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618320002222,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618320002222,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d600ee-00ad-00ff-009a-00b500560043.png",
        "timestamp": 1618319998894,
        "duration": 3463
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618320003060,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618320003075,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618320006283,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618320006283,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00de0021-008d-002a-000d-003b00dd0071.png",
        "timestamp": 1618320002987,
        "duration": 3431
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\0075009f-00c3-005e-00f2-00ce007800a5.png",
        "timestamp": 1618320007061,
        "duration": 6377
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320014187,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320014187,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320014187,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618320014842,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320015011,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320015011,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320015012,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618320015607,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0027007f-00fa-00bd-00bc-003c00480047.png",
        "timestamp": 1618320013955,
        "duration": 2039
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "windows",
        "sessionId": "d5d47e1528ced25d6f9890c91f308975",
        "instanceId": 17764,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320016696,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320016696,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618320016696,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618320017304,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c0005f-004a-008d-005e-00a400ef0057.png",
        "timestamp": 1618320016419,
        "duration": 4599
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326260953,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326261661,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ee0099-0001-00d0-00c7-00d6004f0078.png",
        "timestamp": 1618326259597,
        "duration": 13653
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326273619,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326273719,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cd00e8-0095-0084-008b-00a300c3004a.png",
        "timestamp": 1618326273574,
        "duration": 2722
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326276609,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326276659,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00380049-00be-001a-003b-002300bd004c.png",
        "timestamp": 1618326276553,
        "duration": 2037
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326278927,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326278975,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c800ee-004c-00c8-0053-00e200770058.png",
        "timestamp": 1618326278872,
        "duration": 9095
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326288253,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326288343,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c4008f-00c1-0060-0081-00f000d900c6.png",
        "timestamp": 1618326288212,
        "duration": 9646
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326298280,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0067005b-00a9-0051-006f-00d7008600c7.png",
        "timestamp": 1618326298114,
        "duration": 2657
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326301183,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326301296,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0084007f-0084-0000-00a0-005500390062.png",
        "timestamp": 1618326301076,
        "duration": 2436
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326304043,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326304092,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00650054-00b4-00b4-00d3-00c300c4008c.png",
        "timestamp": 1618326303987,
        "duration": 2677
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 19896,
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
                "timestamp": 1618326306980,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618326307120,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ff00e6-0012-003e-00d5-00c400a600ca.png",
        "timestamp": 1618326306941,
        "duration": 2306
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393957563,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393958456,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004d005e-00a5-00e8-003b-00c600d500ee.png",
        "timestamp": 1618393956473,
        "duration": 13210
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393971191,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393971301,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007b001b-0066-00a8-0001-0097002d0006.png",
        "timestamp": 1618393970489,
        "duration": 3219
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393974714,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393974802,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003d006e-004c-0068-007f-00ee002e00e6.png",
        "timestamp": 1618393974006,
        "duration": 2945
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": [
            "Failed: element click intercepted: Element <button type=\"submit\" ng-disabled=\"form.$invalid || vm.dataLoading\" class=\"btn btn-primary\" disabled=\"disabled\">...</button> is not clickable at point (408, 276). Other element would receive the click: <div class=\"form-actions\">...</div>\n  (Session info: chrome=89.0.4389.128)\n  (Driver info: chromedriver=89.0.4389.23 (61b08ee2c50024bab004e48d2b1b083cdbdac579-refs/branch-heads/4389@{#294}),platform=Windows NT 10.0.19041 x86_64)"
        ],
        "trace": [
            "WebDriverError: element click intercepted: Element <button type=\"submit\" ng-disabled=\"form.$invalid || vm.dataLoading\" class=\"btn btn-primary\" disabled=\"disabled\">...</button> is not clickable at point (408, 276). Other element would receive the click: <div class=\"form-actions\">...</div>\n  (Session info: chrome=89.0.4389.128)\n  (Driver info: chromedriver=89.0.4389.23 (61b08ee2c50024bab004e48d2b1b083cdbdac579-refs/branch-heads/4389@{#294}),platform=Windows NT 10.0.19041 x86_64)\n    at Object.checkLegacyResponse (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\error.js:546:15)\n    at parseHttpResponse (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:509:13)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:441:30\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: WebElement.click()\n    at Driver.schedule (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:807:17)\n    at WebElement.schedule_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2010:25)\n    at WebElement.click (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2092:17)\n    at actionFn (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:89:44)\n    at Array.map (<anonymous>)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:461:65\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as click] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as click] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\IntermediateComponents\\Registrationlogin.js:43:38)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Signin with invalid username and password and assert the error labels\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\IntermediateComponents\\Registrationlogin.js:30:5)\n    at addSpecsToSuite (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\IntermediateComponents\\Registrationlogin.js:5:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393977612,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393977702,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a700d4-00af-00db-000b-0022008700ae.png",
        "timestamp": 1618393977257,
        "duration": 4296
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393982192,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393982280,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009e00d7-00b1-00f8-00fe-005800450059.png",
        "timestamp": 1618393981797,
        "duration": 9297
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393991699,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393991790,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00480048-009a-003f-005a-0057009800f9.png",
        "timestamp": 1618393991351,
        "duration": 2930
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393994890,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393994962,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00550081-00ec-00df-0088-00f5002f00f6.png",
        "timestamp": 1618393994560,
        "duration": 2903
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618393998308,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618393998415,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006e00d3-0076-00f2-0024-007500ff0080.png",
        "timestamp": 1618393997962,
        "duration": 2984
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394001544,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394001636,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004d00c5-005a-0067-00f0-000600110042.png",
        "timestamp": 1618394001194,
        "duration": 1534
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394003653,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394003766,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00070014-009b-0043-0022-006b001f0072.png",
        "timestamp": 1618394002987,
        "duration": 9082
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394013022,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394013087,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00af0047-000c-00ff-0007-00c100d5001d.png",
        "timestamp": 1618394012309,
        "duration": 1569
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394014836,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394014927,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00de0016-0027-0096-00e3-007700b600d3.png",
        "timestamp": 1618394014134,
        "duration": 3977
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394018745,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394018799,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d20030-00c7-008b-00b3-00fc00080083.png",
        "timestamp": 1618394018368,
        "duration": 1495
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394020664,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394020753,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002d0010-00c3-00d0-0040-007e008b0076.png",
        "timestamp": 1618394020124,
        "duration": 1776
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394022530,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394022597,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00210015-00c2-0084-0058-004200a800c5.png",
        "timestamp": 1618394022186,
        "duration": 863
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618394023659,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394023693,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006d0014-0087-0071-0059-0027007d006e.png",
        "timestamp": 1618394023311,
        "duration": 4425
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394028505,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008600cc-00e3-0040-0062-002100b00094.png",
        "timestamp": 1618394028011,
        "duration": 4578
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618394033628,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0000008c-0073-00af-00f2-0009000f00a8.png",
        "timestamp": 1618394032831,
        "duration": 4592
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": [
            "Expected '' to equal 'FEATURES'.",
            "Failed: No element found using locator: By(css selector, a[title='Docs.'])"
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:14:45)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "NoSuchElementError: No element found using locator: By(css selector, a[title='Docs.'])\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:814:27\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as getText] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as getText] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:15:31)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Navigation-Bar Assert\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:12:7)\n    at addSpecsToSuite (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:3:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618394038059,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394038192,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394038223,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394045135,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394045135,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e4001d-0031-00cb-00ed-00bf00c40008.png",
        "timestamp": 1618394037705,
        "duration": 7497
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618394046111,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394046154,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394046168,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394049446,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394049446,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00370012-008a-00a6-007f-00bc009c005d.png",
        "timestamp": 1618394045519,
        "duration": 4019
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618394049965,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394050056,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394050085,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394053476,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394053476,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e100a1-0077-0032-00dd-00b8004d00fc.png",
        "timestamp": 1618394049899,
        "duration": 3656
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618394053910,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394053956,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394053972,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394057154,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394057154,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00670075-00c8-0092-009a-0058006b00ae.png",
        "timestamp": 1618394053877,
        "duration": 3351
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618394057593,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394057631,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618394057647,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394060801,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618394060801,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f7001c-009a-004b-00f5-000d003700e5.png",
        "timestamp": 1618394057561,
        "duration": 3323
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00450029-0021-0060-0054-000800d800c9.png",
        "timestamp": 1618394061218,
        "duration": 4670
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394066350,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394066350,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394066351,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618394067228,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394067355,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394067355,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394067355,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618394067936,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001f0095-00f3-00d5-00e8-00c700a700a1.png",
        "timestamp": 1618394066174,
        "duration": 1989
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8620,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394068640,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394068640,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618394068640,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618394069252,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e800f9-00eb-00b5-0041-002b000600bf.png",
        "timestamp": 1618394068449,
        "duration": 4350
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396761790,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396763415,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00910060-008c-00d4-00e0-009200ad00c5.png",
        "timestamp": 1618396760115,
        "duration": 14249
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396774718,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396774820,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a20005-0001-00aa-0087-00dd00e80008.png",
        "timestamp": 1618396774673,
        "duration": 3076
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396778078,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396778171,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006e0076-00ef-00a1-0067-009f00da0097.png",
        "timestamp": 1618396778023,
        "duration": 2022
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396780366,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396780404,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004d00cc-0051-0061-00d7-005500140069.png",
        "timestamp": 1618396780321,
        "duration": 7284
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396787993,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e000c2-00d5-0010-007a-005300c900ef.png",
        "timestamp": 1618396787850,
        "duration": 8720
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396796861,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396796949,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001000a5-007c-006d-0026-00c5005300d0.png",
        "timestamp": 1618396796816,
        "duration": 1892
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396799038,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396799089,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00880085-00b5-00c6-00c3-0028003e00ba.png",
        "timestamp": 1618396798983,
        "duration": 1682
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396801390,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396801436,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00060070-00fc-0036-0058-004c008e00ab.png",
        "timestamp": 1618396801313,
        "duration": 2993
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396804593,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396804678,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a9000b-0018-00b0-0065-00be00cc00c3.png",
        "timestamp": 1618396804550,
        "duration": 1414
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396806267,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396806354,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008800ed-0043-0098-00f1-004c00ff00e3.png",
        "timestamp": 1618396806224,
        "duration": 8649
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396815166,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396815252,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008500f9-00c6-007f-000f-00a200ae00cc.png",
        "timestamp": 1618396815119,
        "duration": 719
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396816135,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396816221,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0032006f-00df-00f7-0081-000600f10018.png",
        "timestamp": 1618396816093,
        "duration": 4009
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396820398,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396820487,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002b003a-00b1-0038-00ae-00cb00710025.png",
        "timestamp": 1618396820361,
        "duration": 1660
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396822372,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396822456,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a90086-0069-000d-00a5-004300010076.png",
        "timestamp": 1618396822335,
        "duration": 1350
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396823993,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396824089,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0021007c-0023-00df-00c2-00e9009600f2.png",
        "timestamp": 1618396823959,
        "duration": 752
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396825034,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396825080,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fe0058-00cd-0038-0005-0025001a0062.png",
        "timestamp": 1618396824982,
        "duration": 4200
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396829491,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396829578,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00dd001b-00fd-004e-00cf-00e20069005c.png",
        "timestamp": 1618396829455,
        "duration": 4253
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618396834007,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618396834150,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f700ab-00ba-00d9-00ec-009e005d0073.png",
        "timestamp": 1618396833974,
        "duration": 4097
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": [
            "Expected '' to equal 'FEATURES'.",
            "Failed: Wait timed out after 5016ms"
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:14:45)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "TimeoutError: Wait timed out after 5016ms\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2201:17\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: <anonymous wait>\n    at scheduleWait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2188:20)\n    at ControlFlow.wait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2517:12)\n    at Driver.wait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:934:29)\n    at run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:58:33)\n    at ProtractorBrowser.to.<computed> [as wait] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:66:16)\n    at util.until (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\TestUtils.js:7:17)\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:15:14)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\nFrom: Task: Run it(\"Navigation-Bar Assert\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:12:7)\n    at addSpecsToSuite (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:3:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618396838899,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396839008,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396839037,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396842787,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396842787,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001800a5-0055-0076-001f-006a00d900c8.png",
        "timestamp": 1618396838342,
        "duration": 9503
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618396848706,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396848748,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396848763,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396852213,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396852214,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b000a9-0027-001d-0079-007900650061.png",
        "timestamp": 1618396848169,
        "duration": 4144
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618396852672,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396852712,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396852727,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396855907,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396855907,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fd008b-00de-0073-0052-00b4001d0096.png",
        "timestamp": 1618396852634,
        "duration": 3371
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618396856357,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396856401,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396856417,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396859591,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396859591,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a70031-0028-008e-008c-00f0004b00be.png",
        "timestamp": 1618396856324,
        "duration": 3362
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618396860068,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396860106,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618396860121,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396863336,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618396863336,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d000e0-008b-0014-00d3-0049000e0030.png",
        "timestamp": 1618396860026,
        "duration": 3391
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\009f00a5-0018-0085-00cd-00f400c600b7.png",
        "timestamp": 1618396863753,
        "duration": 5024
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396869283,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396869283,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396869283,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618396869917,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396870030,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396870030,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396870030,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618396870625,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f6009c-0084-001b-0047-00b800fd008f.png",
        "timestamp": 1618396869074,
        "duration": 1776
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 11708,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396871525,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396871526,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618396871526,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618396872359,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c7001e-003a-00d6-00f6-008700f20036.png",
        "timestamp": 1618396871166,
        "duration": 4797
    },
    {
        "description": "Multiform Assertion|Multiform Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397353752,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397354705,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f500bf-0022-00b8-001c-00a900ea00da.png",
        "timestamp": 1618397352731,
        "duration": 13875
    },
    {
        "description": "Searchfilter Assertion|Searchfilter Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397367635,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397367742,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007300c7-002f-00d4-0074-00a5000100bb.png",
        "timestamp": 1618397366925,
        "duration": 3830
    },
    {
        "description": "WebTable Assertion|WebTable Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397371077,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397371130,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006d0089-007a-00df-00cb-00dd00ec0013.png",
        "timestamp": 1618397371010,
        "duration": 1464
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397372830,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397372883,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001d00ea-00ee-00f5-00d2-00fa00e900db.png",
        "timestamp": 1618397372758,
        "duration": 8107
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397381161,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397381249,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ac0089-0047-0025-00f3-006200b500a6.png",
        "timestamp": 1618397381112,
        "duration": 9262
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397390674,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397390769,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003000e9-00d2-00a1-0076-00e5001700a6.png",
        "timestamp": 1618397390629,
        "duration": 1902
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397392908,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397392960,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d2006a-00aa-00b2-00ca-00e500800042.png",
        "timestamp": 1618397392845,
        "duration": 1494
    },
    {
        "description": "Normal intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397394905,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397394954,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005600ee-0078-0026-00bd-007b008b00bf.png",
        "timestamp": 1618397394846,
        "duration": 4564
    },
    {
        "description": "Excess Intake Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397399691,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397399775,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009e0073-009a-002c-00cf-003f009f0058.png",
        "timestamp": 1618397399644,
        "duration": 1557
    },
    {
        "description": "Assert for valid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397401491,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397401582,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004d0066-00ca-0049-0091-001c00ed00e5.png",
        "timestamp": 1618397401438,
        "duration": 8283
    },
    {
        "description": "Assert for Invalid calculation in Angular js Calculator|Simple Calculator Assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397410022,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397410109,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005e0067-0070-00ff-00b9-00c80047008a.png",
        "timestamp": 1618397409959,
        "duration": 741
    },
    {
        "description": "CustomersTransaction Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397411018,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397411111,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006b00dc-00ad-0012-0044-000000c70088.png",
        "timestamp": 1618397410970,
        "duration": 4372
    },
    {
        "description": "Customers Deposit Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397416113,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397416168,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003c005e-0076-0083-00e0-00e0007100fc.png",
        "timestamp": 1618397415596,
        "duration": 1781
    },
    {
        "description": "Customers Withdrawal Functionality_check|XYZ_Bank_Customers_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397418073,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397418333,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003400bb-0021-0027-0076-005700b2003d.png",
        "timestamp": 1618397417697,
        "duration": 1848
    },
    {
        "description": "Home page Assert|XYZ Bank Homepage Assert",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397419987,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bd0060-00f9-00d2-0011-00ee00c50010.png",
        "timestamp": 1618397419836,
        "duration": 581
    },
    {
        "description": "Managers_addCustomers_functionality_Check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397420732,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397420773,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0058000f-003c-00b2-00b9-00bf005d00a8.png",
        "timestamp": 1618397420694,
        "duration": 4221
    },
    {
        "description": "manager_Accountfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397425222,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397425313,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bd0012-00bf-0065-0016-00b300f700b2.png",
        "timestamp": 1618397425184,
        "duration": 4331
    },
    {
        "description": "manager_Customerfunctionality_check|XYZ_Bank_Managerlogin_Functionalitycheck",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618397429849,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618397429937,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0085008d-00fa-003c-008a-002e007d002b.png",
        "timestamp": 1618397429798,
        "duration": 3957
    },
    {
        "description": "Navigation-Bar Assert|AngularPage_assertion",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": [
            "Expected '' to equal 'FEATURES'.",
            "Failed: Wait timed out after 5018ms"
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:16:45)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "TimeoutError: Wait timed out after 5018ms\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2201:17\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: <anonymous wait>\n    at scheduleWait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2188:20)\n    at ControlFlow.wait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2517:12)\n    at Driver.wait (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:934:29)\n    at run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:58:33)\n    at ProtractorBrowser.to.<computed> [as wait] (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:66:16)\n    at util.until (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\TestUtils.js:7:17)\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:17:14)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\nFrom: Task: Run it(\"Navigation-Bar Assert\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:13:7)\n    at addSpecsToSuite (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Priyanka\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Priyanka\\Documents\\ProtractorDemos\\Project\\Testcases\\Angular\\Angular.js:4:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618397434402,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397434536,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397434564,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397438051,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397438051,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00470094-008c-0094-0080-008f0068009a.png",
        "timestamp": 1618397434068,
        "duration": 12060
    },
    {
        "description": "Get Titles|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618397446498,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397446565,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397446589,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397449893,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397449893,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e50046-00df-0015-00d5-005700550058.png",
        "timestamp": 1618397446464,
        "duration": 3548
    },
    {
        "description": "Get Bodytext|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618397450389,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397450429,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397450443,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397453622,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397453622,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e80021-0008-0008-005a-0044008c0073.png",
        "timestamp": 1618397450352,
        "duration": 3368
    },
    {
        "description": "Assert Images |AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618397454080,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397454118,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397454133,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397457317,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397457317,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00da00bd-00e0-005c-00d5-000e00f100e4.png",
        "timestamp": 1618397454046,
        "duration": 3342
    },
    {
        "description": "Assert LogoBox|AngularPage_assertion",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://angular.io/ - ::-webkit-details-marker pseudo element selector is deprecated. Please use ::marker instead. See https://chromestatus.com/feature/6730096436051968 for more details.",
                "timestamp": 1618397457753,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/navigation.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397457786,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/polyfills-es2015.1a4c72da9816597260d1.js 0 A preload for 'https://angular.io/generated/docs/index.json' is found, but is not used because the request headers do not match.",
                "timestamp": 1618397457800,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/docs/index.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397460985,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://angular.io/ - The resource https://angular.io/generated/navigation.json was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
                "timestamp": 1618397460985,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d90061-0064-00f3-0031-00e400a10057.png",
        "timestamp": 1618397457723,
        "duration": 3369
    },
    {
        "description": "Home page functionalities|ProtoCommerce Homepage Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00b800d3-004f-0087-008c-003c009d0040.png",
        "timestamp": 1618397461469,
        "duration": 4555
    },
    {
        "description": "print product details|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397466493,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397466493,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397466493,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618397467355,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397467565,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397467565,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397467565,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618397471512,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00dd009f-0084-0023-00dc-0091006f00ea.png",
        "timestamp": 1618397466316,
        "duration": 5411
    },
    {
        "description": "add to Cart|ProtoCommerce Shop_page Functionality",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 2080,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.128"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397472327,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397472327,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://rahulshettyacademy.com/angularpractice/shop - Mixed Content: The page at 'https://rahulshettyacademy.com/angularpractice/shop' was loaded over HTTPS, but requested an insecure element 'http://placehold.it/900x350'. This request was automatically upgraded to HTTPS, For more information see https://blog.chromium.org/2019/10/no-more-mixed-messages-about-https.html",
                "timestamp": 1618397472327,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://placehold.it/900x350 - Failed to load resource: net::ERR_CERT_DATE_INVALID",
                "timestamp": 1618397472924,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000e00a4-00ec-0024-00f2-0049005d00b4.png",
        "timestamp": 1618397472126,
        "duration": 4303
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
