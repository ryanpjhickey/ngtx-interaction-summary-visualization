var maxDataTableRows = 5;
var ds = window.ds;

/**
 * Initialize page, get all data and render on page
 */
function initCallSummary(){
	divEle = document.getElementById("ResultsDiv");

	initMsgs(function(){
		initFieldLabels(function(){
			initData(function(){
				updateUIWithMsgs();
				updateDataTables(calls);
				updateFilteredCallSummaryDates(calls);
			});
		});
	});
}

/*
 * get all veeva messages to be shown on the page
 */
function initMsgs(callback){
	var msgsToGet = [
		buildVeevaMsgToGet("Period", "Analytics", "Period"),
		buildVeevaMsgToGet("QTY", "SAMPLES_MGMT", "QTY"),
		buildVeevaMsgToGet("CALL_DATE", "VIEW_SIG", "Call Date"),
		buildVeevaMsgToGet("ALL_ACTIVITY", "FieldReporting", "All Activity"),
		buildVeevaMsgToGet("MCCP_MY_ACTIVITY", "Multichannel", "My Activity"),
		buildVeevaMsgToGet("NAME", "Common", "Name"),
		buildVeevaMsgToGet("NO_RECORDS", "Common", "No records to display"),
		buildVeevaMsgToGet("CALL_SUMMARY", "FieldReporting", "Call Summary"),
		buildVeevaMsgToGet("RECENT_KEY_MESSAGES", "FieldReporting", "Recent Key Messages"),
		buildVeevaMsgToGet("SET_SAMPLES", "TABLET", "Samples"),
		buildVeevaMsgToGet("CALL_OBJECTIVES", "CallObjectives", "Call Objectives")
	];
	
	initMsgCache(msgsToGet, function(){
		callback();
	});
}

/**
 * Get all data to be be shown on page
 */
function initData(callback){
	getCurrentAccountId(function(id){
		acctId = id;

		getCallsForAccount(id, function(allCalls){
			calls = allCalls;

			getCallSamplesForCalls(allCalls, function(allCallSamples){
				callSamples = allCallSamples;

				getCallDetailsForCalls(allCalls, function(allCallDetails){
					callDetails = allCallDetails;

					getProductsForSamples(callSamples, callDetails, function(allProds){
						prods = allProds;

						getKeyMsgsForCalls(calls, function(allKeyMsgs){
							keyMsgs = allKeyMsgs;

							getProductsForCallKeyMsgs(callKeyMsgs, function(callKeyMsgProds){
								if (callKeyMsgProds != null){
									for (var index in callKeyMsgProds){
										prods.push(callKeyMsgProds[index]);
									}
								}
								getCallObjectivesForCalls(calls, function(allCallObjectives){
									callObjectives = allCallObjectives;
									callback();
								});
							});
						});
					});
				});
			});
		});
	});
}

/*
 * Update the data tables with the filtered data
 * @param filteredCalls: array of calls that are valid after applying filters
 */
function updateDataTables(filteredCalls){
	resetData();
	updateKeyMsgTable(filteredCalls);
	updateSamplestable(filteredCalls);
	updateCallObjectiveTable(filteredCalls);
	updateFilteredCallSummaryDates(filteredCalls);
}

/**
 * get field labels that will be used as labels on the page
 */
function initFieldLabels (callback) {
    var keyMessageConfig = {
        object: 'Key_Message_vod__c',
        fields: ['Description_vod__c']
    }

    ds.getFieldLabels(keyMessageConfig).then(function (results) {

        fieldLabels.push({
			labelName: 'keyMsgDesc',
            labelValue: results[0].display
        });

        var callKeyMessageConfig = {
            object: 'Call2_Key_Message_vod__c',
            fields: [
                'Reaction_vod__c',
                'Product_vod__c',
                'Call_Date_vod__c',
                'Category_vod__c']
        }

        ds.getFieldLabels(callKeyMessageConfig).then(function (resp1) {

            fieldLabels.push({
                labelName: 'keyMsgReactionLabel',
                labelValue: resp1[0].display
            });

            fieldLabels.push({
                labelName: 'keyMsgProdLabel',
                labelValue: resp1[1].display
            });

            fieldLabels.push({
                labelName: 'keyMsgCallDateLabel',
                labelValue: resp1[2].display
            });

            fieldLabels.push({
                labelName: 'keyMsgCategoryLabel',
                labelValue: resp1[3].display
            });

            var callObjectiveConfig = {
                object: 'Call_Objective_vod__c',
                fields: ['Product_vod__c', 'From_Date_vod__c', 'To_Date_vod__c']
            }

            ds.getFieldLabels(callObjectiveConfig).then(function (resp2) {

                fieldLabels.push({
                    labelName: 'callObjectiveProdLabel',
                    labelValue: resp2[0].display
                });

                fieldLabels.push({
                    labelName: 'callObjectiveFromLabel',
                    labelValue: resp2[1].display
                });

                fieldLabels.push({
                    labelName: 'callObjectiveToLabel',
                    labelValue: resp2[2].display
                });

                var mySetupProductConfig = {
                    object: 'My_Setup_Products_vod__c',
                    fields: ['Product_vod__c']
                }

                ds.getFieldLabels(mySetupProductConfig).then(function (resp3) {

                    fieldLabels.push({
                        labelName: 'sampleTableProdLabel',
                        labelValue: resp3[0].display
                    });

                    var productConfig = {
                        object: 'Product_vod__c',
                        fields: ['Product_Type_vod__c']
                    }

                    ds.getFieldLabels(productConfig).then(function (resp4) {

                        fieldLabels.push({
                            labelName: 'sampleTableProdTypeLabel',
                            labelValue: resp4[0].display
                        });

                        callback();
                    }, showFailure);
                }, showFailure);
            }, showFailure);
        }, showFailure);
    }, showFailure);
}

/**
 * Apply the veeva messages and field labels on the page
 */
function updateUIWithMsgs(){
	document.getElementById("callSummaryTitle").innerHTML = getMsg("CALL_SUMMARY", "FieldReporting");
	document.getElementById("callSummaryTimePeriodLabel").innerHTML = getMsg("Period", "Analytics") + ": ";
	document.getElementById("callAllActivityBtn").innerHTML = getMsg("ALL_ACTIVITY", "FieldReporting");
	document.getElementById("callMyActivityBtn").innerHTML = getMsg("MCCP_MY_ACTIVITY", "Multichannel");
	document.getElementById("sampleTableQTYLabel").innerHTML = getMsg("QTY", "SAMPLES_MGMT");
	document.getElementById("sampleTableCallDateLabel").innerHTML = getMsg("CALL_DATE", "VIEW_SIG");
	document.getElementById("callObjectiveNameLabel").innerHTML = getMsg("NAME", "Common");
	document.getElementById("keyMsgNameLabel").innerHTML = getMsg("NAME", "Common");
	document.getElementById("keyMsgsTitle").innerHTML = getMsg("RECENT_KEY_MESSAGES", "FieldReporting");
	document.getElementById("samplesTitle").innerHTML = getMsg("SET_SAMPLES", "TABLET");
	document.getElementById("callObjectivesTitle").innerHTML = getMsg("CALL_OBJECTIVES", "CallObjectives");

	document.getElementById("keyMsgDescLabel").innerHTML = getFieldLabel("keyMsgDesc", "Description");
	document.getElementById("keyMsgProdLabel").innerHTML = getFieldLabel("keyMsgProdLabel", "Product");
	document.getElementById("keyMsgReactionLabel").innerHTML = getFieldLabel("keyMsgReactionLabel", "Reaction");
	document.getElementById("keyMsgCallDateLabel").innerHTML = getFieldLabel("keyMsgCallDateLabel", "Call Date");
	document.getElementById("keyMsgCategoryLabel").innerHTML = getFieldLabel("keyMsgCategoryLabel", "Category");
	document.getElementById("callObjectiveProdLabel").innerHTML = getFieldLabel("callObjectiveProdLabel", "Product");
	document.getElementById("callObjectiveFromLabel").innerHTML = getFieldLabel("callObjectiveFromLabel", "From Date");
	document.getElementById("callObjectiveToLabel").innerHTML = getFieldLabel("callObjectiveToLabel", "To Date");
	document.getElementById("sampleTableProdLabel").innerHTML = getFieldLabel("sampleTableProdLabel", "Product");
	document.getElementById("sampleTableProdTypeLabel").innerHTML = getFieldLabel("sampleTableProdTypeLabel", "Product Type");	
}

function filterChanged(){
	updateDataTables(getFilteredCalls(calls));
}

function getFilteredCalls(allCalls){	
	if (userId != ""){
		var filteredCalls = [];

		for (var index in allCalls){
			if ((userId != "" && !isCallCreatedByCurrentUser(userId, allCalls[index].Id)) ){
				continue;
			}
			filteredCalls.push(allCalls[index]);
		}
		return filteredCalls;
	}
	else{
		return allCalls;
	}
}

/**
 * Reset the data rows in the tables
 */
function resetData(){
	delAllDataRows("keyMsgsTable");
	delAllDataRows("samplesTable");
	delAllDataRows("callObjectiveTable");
}

function updateKeyMsgTable(filteredCalls){
	var rowIter = 1;
	var data = [];

	for (var callIndex in filteredCalls){
		for (var callKeyMsgIndex in callKeyMsgs){
			if (callKeyMsgs[callKeyMsgIndex].Call2_vod__c == filteredCalls[callIndex].Id){
				for (var index in keyMsgs){
					if (callKeyMsgs[callKeyMsgIndex].Key_Message_vod__c == keyMsgs[index].Id){
						data.push({
							msg: keyMsgs[index].Name, 
							desc: keyMsgs[index].Description_vod__c,
							category: callKeyMsgs[callKeyMsgIndex].Category_vod__c,
							prod: getProdName(callKeyMsgs[callKeyMsgIndex].Product_vod__c),
							reaction: callKeyMsgs[callKeyMsgIndex].Reaction_vod__c,
							callDate: dateStringToDate(filteredCalls[callIndex].Call_Date_vod__c).toLocaleDateString()
						});
					}
				}
			}
		}
	}

	for (var index in data){
		if (index >= maxDataTableRows){
			break;
		}
		addRow("keyMsgsTable", [data[index].msg, data[index].desc, data[index].category, data[index].prod, data[index].reaction, data[index].callDate], rowIter++);
	}
	if (!doesTableHaveData("keyMsgsTable")){
		showNoData("keyMsgsTable");
	}
}

function updateSamplestable(filteredCalls){
	var rowIter = 1;
	var data = [];

	for (var callIndex in filteredCalls){
		for (var callSampleIndex in callSamples){
			if (filteredCalls[callIndex].Id == callSamples[callSampleIndex].Call2_vod__c){
				if (data[callSamples[callSampleIndex].Product_vod__c] == null){
					data[callSamples[callSampleIndex].Product_vod__c] = {
						prodId: callSamples[callSampleIndex].Product_vod__c,
						qty: parseInt(callSamples[callSampleIndex].Quantity_vod__c),
						prodName: getProdName(callSamples[callSampleIndex].Product_vod__c),
						prodType: getProdType(callSamples[callSampleIndex].Product_vod__c),
						mostRecentCall: dateStringToDate(filteredCalls[callIndex].Call_Date_vod__c).toLocaleDateString()
					};
				}
				else{
					data[callSamples[callSampleIndex].Product_vod__c].qty += parseInt(callSamples[callSampleIndex].Quantity_vod__c);
				}
			}
		}
	}

	var sortedData = [];
	for (var dataIndex in data){
		sortedData.push(data[dataIndex]);
	}		
	sortedData.sort(function(a,b){return b.qty - a.qty});

	for (var index in sortedData){
		if (index >= maxDataTableRows){
			break;
		}
		addRow("samplesTable", [sortedData[index].prodName, sortedData[index].prodType, sortedData[index].mostRecentCall, sortedData[index].qty], rowIter++);
	}

	if (!doesTableHaveData("samplesTable")){
		showNoData("samplesTable");
	}
}

function updateCallObjectiveTable(filteredCalls){
	var rowIter = 1;
	var data = [];

	for (var callIndex in filteredCalls){
		for (var callObjectiveIndex in callObjectives){
			if (callObjectives[callObjectiveIndex].Call2_vod__c == filteredCalls[callIndex].Id){
				data.push({
					objectiveName: callObjectives[callObjectiveIndex].Name_vod__c, 
					prod: getProdName(callObjectives[callObjectiveIndex].Product_vod__c),
					fromDate: dateStringToDate(callObjectives[callObjectiveIndex].From_Date_vod__c).toLocaleDateString(),
					toDate: dateStringToDate(callObjectives[callObjectiveIndex].To_Date_vod__c).toLocaleDateString()
				});
			}
		}
	}

	for (var index in data){
		if (index >= maxDataTableRows){
			break;
		}
		addRow("callObjectiveTable", [data[index].objectiveName, data[index].prod, data[index].fromDate, data[index].toDate], rowIter++);
	}
	
	if (!doesTableHaveData("callObjectiveTable")){
		showNoData("callObjectiveTable");
	}
}

/**
 * Update the time period shown based on the call dates of the filtered calls
 * @param filteredCalls: array of calls that are valid after applying filters
 */
function updateFilteredCallSummaryDates(filteredCalls){
	if (filteredCalls[filteredCalls.length - 1] && filteredCalls[filteredCalls.length - 1].Call_Date_vod__c) {
        document.getElementById("periodStartDate").innerHTML = dateStringToDate(filteredCalls[filteredCalls.length - 1].Call_Date_vod__c).toLocaleDateString();
	}

	if (filteredCalls[0] && filteredCalls[0].Call_Date_vod__c) {
        document.getElementById("periodEndDate").innerHTML = dateStringToDate(filteredCalls[0].Call_Date_vod__c).toLocaleDateString();
	}
}
