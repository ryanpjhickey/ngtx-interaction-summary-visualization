var divEle;
var acctId = "";
var userId = "";
var showAeSection = true;
var sentEmailLimit = 1000;
var calls = [];
var callSamples = [];
var callDetails = [];
var callKeyMsgs = [];
var keyMsgs = [];
var callObjectives = [];
var prods = [];
var mySetupProdIds = [];
var sentEmails = [];
var approvedDocs = [];
var allApprovedDocs = [];
var fieldLabels = [];
var picklistLabels = [];
var missingFlds = [];
var ds = window.ds;

var frameURL;
var token;

if (isOnline()) {
    frameURL = document.URL;
    token = frameURL.split('?')[1];
}

function goBack(){
	if (isOnline()) {
        window.location.href = 'index.html?' + token;
	}else {
        window.location.href = 'index.html';
	}
}

function isWin8() {
    return navigator.platform.toLowerCase().indexOf('win') >= 0;
}

function isOnline() {
    var host = window.location.hostname;
    var onlineRETest = /cdnhtml/gi;
    return onlineRETest.test(host);
}

function getProperFalseValue() {
	if(isOnline()){
    	return false;
	}

	if (isWin8()){
		return "'false'";
	}

	return 0;
}

//Since SQLite does not store timeStamp as DateTime
function getProperNullValue() {
    if(isOnline()){
        return null;
    }

    return "''";
}

function getClauseFor(fieldName) {
    return fieldName + ' = ' + getProperFalseValue();
}

/**
* Gets the Id of the current Account
* @param {Function} callback(result): function to be run on completion
*/
function getCurrentAccountId(callback){

    ds.getDataForCurrentObject('Account', 'Id').then(function(results) {
        var accountId = results['Account'].Id;
        if (results.success){
            callback(accountId);
        } else {
            showFailure(results);
            callback(null);
        }
    }, function(e) {
    	console.log(e);
	});
}

function doesFieldExist(objectName, fld, callback){
	var sortClause = null;
	var whereClause = null;

    ds.queryRecord(objectName, fld, whereClause, sortClause, 1, null).then(function(results) {
        if (!results.success){
            if (missingFlds.indexOf(objectName + "." + fld) === -1){
                missingFlds.push(objectName + "." + fld);
            }
        }
        callback(results.success);
	}, function(error) {
        console.log(error)
        callback(false);
    });
}

/**
* Gets all (non deleted, synced) calls for the account.
* @param {String} accountId: Id of Account
* @param {Function} callback(result): function to be run on completion. result is array of calls ordered by date
*/
function getCallsForAccount(accountId, callback){
	var fieldsToGet = ["Id", "Name", "CreatedDate", "Call_Type_vod__c", "Status_vod__c", "Call_Date_vod__c", "CreatedById"];

	doesFieldExist("Call2_vod__c", ['CLM_vod__c'], function(fldExists){
		if (fldExists){
			fieldsToGet.push("CLM_vod__c");
		}

		var sortClause = ["Call_Date_vod__c DESC"];
        var whereClause = "Account_vod__c='" + acctId + "' AND " + getClauseFor('IsDeleted');


		if (!isOnline()) {
            whereClause += " AND Id != Mobile_ID_vod__c";
		}

		// offline query
		//var whereClause = "Account_vod__c='" + acctId + "' AND IsDeleted = false AND Id != Mobile_ID_vod__c";

		// online query
		//var whereClause = "Account_vod__c='" + acctId + "' AND IsDeleted = false";

        ds.queryRecord("Call2_vod__c", fieldsToGet, whereClause, sortClause, null, null).then(function(results) {
        	if (results.success){
                var ret = [];
                for (var index in results["Call2_vod__c"]){
                    ret.push(results["Call2_vod__c"][index]);
                }

                callback(ret);
            } else {
                showFailure(results);
                callback(null);
            }
		}, function(error) {
        	console.log(error)
        });

	});
}

function getCallSamplesForCalls(allCalls, callback){
    var callIds = [];
    var fields = ['Name', 'Id', 'CreatedDate', 'Call2_vod__c', 'Product_vod__c', 'Quantity_vod__c'];
    var sortClause = ['Name ASC'];
    var whereClause = getClauseFor('IsDeleted') + ' AND Call2_vod__c IN ';

    for (var callIndex in allCalls){
        callIds.push(allCalls[callIndex].Id);
    }

    whereClause += ds.getInStatement(callIds);

    ds.queryRecord("Call2_Sample_vod__c", fields, whereClause, sortClause, null, null).then(function(results) {
        if (results.success){
            var ret = [];
            for (var index in results["Call2_Sample_vod__c"]){
                ret.push(results["Call2_Sample_vod__c"][index]);
            }

            callback(ret);
        } else {
            showFailure(results);
            callback(null);
        }
    }, function(error){
        console.log(error)
    });
}

function getCallDetailsForCalls(allCalls, callback){
	var callIds = [];
	var fields = ['Product_vod__c', 'Call2_vod__c'];
	var sortClause = ["Name ASC"];

	for (var callIndex in allCalls){
		callIds.push(allCalls[callIndex].Id);
	}

    var whereClause = getClauseFor('IsDeleted') + ' AND Call2_vod__c IN ' + ds.getInStatement(callIds);

    ds.queryRecord("Call2_Detail_vod__c", fields, whereClause, sortClause, null, null).then(function(results) {
        if (results.success){
            var ret = [];
            for (var index in results["Call2_Detail_vod__c"]){
                ret.push(results["Call2_Detail_vod__c"][index]);
            }
            callback(ret);
        } else {
            showFailure(results);
            callback(null);
        }
	})
}

function getProductsForSamples(allCallSamples, allCallDetails, callback){
	var prodIds = [];
	for (var callSampleIndex in allCallSamples){
		var prodId = allCallSamples[callSampleIndex].Product_vod__c;
		if (prodIds.indexOf(prodId) === -1){
			prodIds.push(prodId);	
		}
	}
	for (var callDetailIndex in allCallDetails){
		var prodId = allCallDetails[callDetailIndex].Product_vod__c;
		if (prodIds.indexOf(prodId) === -1){
			prodIds.push(prodId);	
		}
	}

	getProductsFromProductIds(prodIds, function(results){
		callback(results);
	});
}

function getProductsForCallKeyMsgs(allCallKeyMsgs, callback){
	var prodIds = [];

	for (var index in callKeyMsgs){
		var prodId = callKeyMsgs[index].Product_vod__c;
		if (prodIds.indexOf(prodId) === -1){
			prodIds.push(prodId);	
		}
	}

	getProductsFromProductIds(prodIds, function(results){
		callback(results);
	})
}

function getProductsFromProductIds(prodIds, callback){
	var fields = ['Name', 'Id', 'Product_Type_vod__c'];
	var sortClause = ["Name ASC"];
    var whereClause = "Id IN " + ds.getInStatement(prodIds);

    ds.queryRecord("Product_vod__c", fields, whereClause, sortClause, null, null).then(function(results) {
        if (results.success){
            var ret = [];
            for (var index in results["Product_vod__c"]){
                ret.push(results["Product_vod__c"][index]);
            }

            callback(ret);
        } else {
            showFailure(results);
            callback(null);
        }
	});
}

function getKeyMsgsForCalls(allCalls, callback){
	var callIds = [];
	for (var callIndex in allCalls){
		callIds.push(allCalls[callIndex].Id);
	}
	var fields = ['Name', 'Id', 'Call2_vod__c', 'Key_Message_vod__c', 'Reaction_vod__c', 'Call_Date_vod__c', 'Product_vod__c', 'Category_vod__c'];
	var sortClause = ["Name ASC"];

    var whereClause = "Call2_vod__c IN " + ds.getInStatement(callIds);

    ds.queryRecord("Call2_Key_Message_vod__c", fields, whereClause, sortClause, null, null).then(function(results) {
        if (results.success){
            var keyMsgIds = [];

            for (var index in results["Call2_Key_Message_vod__c"]){
                callKeyMsgs.push(results["Call2_Key_Message_vod__c"][index]);

                if (keyMsgIds.indexOf(results["Call2_Key_Message_vod__c"][index].Key_Message_vod__c) === -1){
                    keyMsgIds.push(results["Call2_Key_Message_vod__c"][index].Key_Message_vod__c);
                }
            }

            var fields = ['Name', 'Id', 'Description_vod__c'];
            var sortClause = ["Name ASC"];
            var whereClause = "Id IN " + ds.getInStatement(keyMsgIds);

            ds.queryRecord("Key_Message_vod__c", fields, whereClause, sortClause, null, null).then(function(results) {
                if (results.success){
                    var ret = [];

                    for (var index in results["Key_Message_vod__c"]){
                        ret.push(results["Key_Message_vod__c"][index]);
                    }
                    callback(ret);
                } else {
                    showFailure(results);
                    callback(null);
                }
			});
        }
        else{
            showFailure(results);
            callback(null);
        }
	});
}

function getCallObjectivesForCalls(allCalls, callback){
	var fields = ['Name_vod__c', 'Id', 'CreatedDate', 'Call2_vod__c', 'Product_vod__c', 'Completed_Flag_vod__c', 'From_Date_vod__c', 'To_Date_vod__c'];
	var sortClause = ["Name ASC"];

	var callIds = [];
	for (var callIndex in allCalls){
		callIds.push(allCalls[callIndex].Id);
	}

    var whereClause = getClauseFor('IsDeleted') + " AND Call2_vod__c IN " + ds.getInStatement(callIds) + "AND " + getClauseFor('Completed_Flag_vod__c');

    ds.queryRecord("Call_Objective_vod__c", fields, whereClause, sortClause, null, null).then(function(results) {
        if (results.success){
            var ret = [];
            for (var index in results["Call_Objective_vod__c"]){
                ret.push(results["Call_Objective_vod__c"][index]);
            }

            callback(ret);
        } else {
            showFailure(results);
            callback(null);
        }
	});
}

function getFieldLabel(labelName, defaultValue){
	var fldVal = defaultValue;

	for (var index in fieldLabels){
		if (fieldLabels[index].labelName === labelName){
			fldVal = fieldLabels[index].labelValue;
			break;
		}
	}
	return fldVal;
}

function getCurrentUserId(callback){
	window.ds.getDataForCurrentObject('User', 'Id').then(function(results) {
        var userId = results['User'].Id;
		callback(userId);
	}, showFailure);
}

function getProdName(prodId){
	for (var index in prods){
		if (prods[index].Id === prodId){
			return prods[index].Name;
		}
	}
	return "";
}

function getProdType(prodId){
	for (var index in prods){
		if (prods[index].Id === prodId){
			return prods[index].Product_Type_vod__c;
		}
	}
	return "";
}

/**
 * Get all emails (limited to the 1,000 most recent) that where successfully sent to the account
 */
function getApprovedEmails(callBack){
	window["getSentEmailProductsCallback"] = function(results) {
		if (results.success){
			for (var index in results["Product_vod__c"]){
				prods.push(results["Product_vod__c"][index]);
			}
			callBack();
		}
		else{
			showFailure(results);
			callBack();
		}
	};
	window["getSentEmailsCallback"] = function(results) {
		if (results.success){
			var aeProdIds = [];
			for (var index in results["Sent_Email_vod__c"]){
				if (aeProdIds.indexOf(results["Sent_Email_vod__c"][index].Product_vod__c) === -1){
					aeProdIds.push(results["Sent_Email_vod__c"][index].Product_vod__c);
				}
				sentEmails.push(results["Sent_Email_vod__c"][index]);
			}

			var fields = ['Name', 'Id'];
			var sortClause = ["Name ASC"];
            var whereClause = "Id IN " + ds.getInStatement(aeProdIds);

            ds.queryRecord("Product_vod__c", fields, whereClause, sortClause, null, null).then(getSentEmailProductsCallback);
		}
		else{
			showAeSection = false;

			//if Sent_Email_vod__c is not found - Approved Email is not configured - don't show errors
			if (results.code !== "1011"){
				showFailure(results);
			}

			callBack();
		}
	};

	var fieldsToGet = ["Id", "CreatedDate", "CreatedById", "Account_vod__c", "Email_Fragments_vod__c", "Product_vod__c", "Email_Sent_Date_vod__c", "Product_Display_vod__c"];
	doesFieldExist("Sent_Email_vod__c", ['Clicked_vod__c'], function(fldExists){
		if (fldExists){
			fieldsToGet.push("Clicked_vod__c");
		}
		doesFieldExist("Sent_Email_vod__c", ['Opened_vod__c'], function(fldExists){
			if (fldExists){
				fieldsToGet.push("Opened_vod__c");
			}

			var sortClause = ["Email_Sent_Date_vod__c DESC"];
            //offline original
			//var whereClause = "Account_vod__c='"+ acctId + "' AND Status_vod__c IN ('Delivered_vod', 'Unsubscribed_vod') AND Email_Sent_Date_vod__c != ''";

			//online now
			var whereClause = "Account_vod__c='"+ acctId + "' AND Status_vod__c IN " + ds.getInStatement(['Delivered_vod', 'Unsubscribed_vod']) + " AND Email_Sent_Date_vod__c != " + getProperNullValue();

            ds.queryRecord("Sent_Email_vod__c", fieldsToGet, whereClause, sortClause, sentEmailLimit, null).then(getSentEmailsCallback, function(e){
            	console.log(e);
			});
		});	
	});
}

function getApprovedDocs(callBack){
	var appDocIds = [];
	var index;
	var count = sentEmails.length || 0;

	for (index = 0; index < count; index+=1 ) {
		if (sentEmails[index].Email_Fragments_vod__c) {
            var frags = sentEmails[index].Email_Fragments_vod__c.split(",");
            for (var fragIndex in frags){
                var fragId = frags[fragIndex].trim();
                if (fragId !== '' && appDocIds.indexOf(fragId) === -1){
                    appDocIds.push(frags[fragIndex].trim());
                }
            }
		}
	}

	var fields = ['Id', 'Name'];
	var sortClause = ["CreatedDate DESC"];
    var whereClause = "Id IN " + ds.getInStatement(appDocIds) + " AND " + getClauseFor('IsDeleted');

    ds.queryRecord("Approved_Document_vod__c", fields, whereClause, sortClause, null, null).then(function(results){
        if (results.success){
            for (var index in results["Approved_Document_vod__c"]){
                approvedDocs.push(results["Approved_Document_vod__c"][index]);
            }
        } else {
            showFailure(results);
        }
        callBack();
	});
}

function getAllApprovedDocs(callBack){
	if (mySetupProdIds.length > 0){
		var fields = ['Id', 'Name', 'Product_vod__c'];
		var sortClause = ["CreatedDate DESC"];
        var whereClause = "Product_vod__c IN " + ds.getInStatement(mySetupProdIds) + " AND Status_vod__c='Approved_vod'";

        ds.queryRecord("Approved_Document_vod__c", fields, whereClause, sortClause, null, null).then(function(results){
            if (results.success){
                for (var index in results["Approved_Document_vod__c"]){
                    allApprovedDocs.push(results["Approved_Document_vod__c"][index]);
                }
            } else {
                showFailure(results);
            }
            callBack();
		});
	} else {
		callBack();
	}
}

function getMySetupProds(callback){
	var objectName = 'Product_vod__c';
    var fields = ['ID'];
	var detailWhereClause = "Product_Type_vod__c = 'Detail'";
	var detailTopicWhereClause = "Product_Type_vod__c = 'Detail Topic'";

	ds.queryRecord(objectName, fields, detailWhereClause).then(function(results){
		for (var index in results['Product_vod__c']){
			mySetupProdIds.push(results['Product_vod__c'][index]['ID']);
		}

        ds.queryRecord(objectName, fields, detailTopicWhereClause).then(function(results){

			for (var index in results["Product_vod__c"]){
				mySetupProdIds.push(results["Product_vod__c"][index]["ID"]);
			}

            callback();
		}, showFailure);
	}, showFailure);
}

function myActivityClicked(){
	getCurrentUserId(function(userIdResult){
        userId = userIdResult;
        document.getElementById("callMyActivityBtn").className = "pageHeaderActivityBtnSelected";
        document.getElementById("callAllActivityBtn").className = "pageHeaderActivityBtnNotSelected";
        document.getElementById("aeMyActivityBtn").className = "pageHeaderActivityBtnSelected";
        document.getElementById("aeAllActivityBtn").className = "pageHeaderActivityBtnNotSelected";

        filterChanged();
	});
}

function allActivityClicked(){
	if (document.getElementById("callMyActivityBtn")) {
        document.getElementById("callMyActivityBtn").className = "pageHeaderActivityBtnNotSelected";
	}

	if (document.getElementById("callAllActivityBtn")) {
        document.getElementById("callAllActivityBtn").className = "pageHeaderActivityBtnSelected";
	}

	if (document.getElementById("aeMyActivityBtn")) {
        document.getElementById("aeMyActivityBtn").className = "pageHeaderActivityBtnNotSelected";
	}

	if (document.getElementById("aeAllActivityBtn")) {
        document.getElementById("aeAllActivityBtn").className = "pageHeaderActivityBtnSelected";
	}

	userId = '';
	filterChanged();
}

function isCallCreatedByCurrentUser(currUserId, callId){
	if (currUserId !== ''){
		var call = getCallById(callId);

		if (call !== null && currUserId === call.CreatedById){
			return true;
		}
	}
	return false;
}

function getCallById(callId){
	for (var callIndex in calls){
		if (calls[callIndex].Id === callId){
			return calls[callIndex];
		}
	}
	return null;
}

function dateStringToDate(dateString){
	dateString = dateString.replace(/-/g, '\/');
	return new Date(dateString.substring(0, 10));
}

function addRow(tblName, colData, rowNum){
	var table = document.getElementById(tblName);
	var tableRow = table.insertRow(rowNum);

	for (var index in colData){
		var cell = tableRow.insertCell(index);
		cell.innerHTML = colData[index];
	}
}

function delAllDataRows(tblName){
	var table = document.getElementById(tblName);

	for (i = (table.rows.length - 1); i >= 1; i--){
		table.deleteRow(i);
	}
}

function doesTableHaveData(tblName){
	var table = document.getElementById(tblName);

	if (table.rows.length > 1){
		return true;
	}
	else{
		return false;
	}
}

function showNoData(tblName){
	var table = document.getElementById(tblName);
	var headerRow = table.rows[0];
	var colCount = headerRow.cells.length;

	var colData = [];
	colData.push(getMsg("NO_RECORDS", "Common"));

	for (i = 1; i < colCount; i++){
		colData.push('');
	}

	addRow(tblName, colData, 1);
}

function showFailure(results){
	divEle.innerHTML += "<br>Failed: = " + (JSON.stringify(results.message));
}

function showMsg(msg){
	divEle.innerHTML += "<br>" + msg;
}

function goBack(){
	if (isOnline()) {
        window.location.href = 'index.html?' + token;
	}else {
        window.location.href = 'index.html';
	}
}

function goToCallSummary(){
	if (isOnline()) {
        window.location.href = 'callSummary.html?' + token;
	}else {
        window.location.href = 'callSummary.html';
	}
}

function goToApprovedEmail(){
	if (isOnline()) {
        window.location.href = 'approvedEmail.html?' + token;
	}else {
        window.location.href = 'approvedEmail.html';
	}
}
