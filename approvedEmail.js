var hasData = false;
var ds = window.ds

function init(){
	divEle = document.getElementById("ResultsDiv");
	
	initMsgs(function(){
		initFieldLabels(function(){
			initAEData(function(){
				getMySetupProds(function(){
					getAllApprovedDocs(function(){
						showAvailableFragments(allApprovedDocs, function(){
						});
					});
				});
				updateUIWithMsgs();
			});
		});
	});
}

function initAEData(callback){
	getCurrentAccountId(function(id){
		acctId = id;

		getApprovedEmails(function(){
			getApprovedDocs(function(){
				callback();
			});
		});
	});
}

function showAvailableFragments(filteredDocs, callback){


	var data = [];
	var prodIds = [];

	for (var index in filteredDocs){
		if (prodIds.indexOf(filteredDocs[index].Product_vod__c) == -1 && filteredDocs[index].Product_vod__c != ''){
			prodIds.push(filteredDocs[index].Product_vod__c);
		}
	}

	getProductsFromProductIds(prodIds, function(results){
		for (var index in prodIds){
			data.push({prodId: prodIds[index], prodName: getProdName(prodIds[index])})
		}

		var sortedData = [];
		for (var dataIndex in data){
			sortedData.push(data[dataIndex]);
		}		
		sortedData.sort(function(a,b){return a.prodName.localeCompare(b.prodName)});
		
		for (var dataIndex in sortedData){
			if (sortedData[dataIndex].prodName != ''){
				createTable(sortedData[dataIndex].prodId, sortedData[dataIndex].prodName, [getMsg("EMAIL_FRAGMENT", "ApprovedEmail")]);
				var rowIter = 1;

				for (var index in filteredDocs){
					if (filteredDocs[index].Product_vod__c != '' && filteredDocs[index].Product_vod__c == sortedData[dataIndex].prodId){
						if (rowIter >= 6){
							break;
						}
						addRow(sortedData[dataIndex].prodId, [filteredDocs[index].Name], rowIter++);
					}
				}
			}
		}
		
		callback();
	});
}

function fragsAvailableTabClicked(){
	document.getElementById("fragsAvailableTab").className = "tabSelected";
	filterChanged();
}

function aeMyActivityClicked(){
    getCurrentUserId(function(userIdResult) {
        userId = userIdResult;
        document.getElementById("myActivityBtn").className = "pageHeaderActivityBtnSelected";
        document.getElementById("allActivityBtn").className = "pageHeaderActivityBtnNotSelected";

        filterChanged();
	});
}

function aeAllActivityClicked(){
	document.getElementById("myActivityBtn").className = "pageHeaderActivityBtnNotSelected";
	document.getElementById("allActivityBtn").className = "pageHeaderActivityBtnSelected";

	userId = "";
	filterChanged();
}

function filterChanged(){
	clearDataTables();

	document.getElementById("timePeriodTable").style.display = "none";
	if (allApprovedDocs.length > 0){
		showAvailableFragments(allApprovedDocs, function(){

		});
	}
	else{
		getMySetupProds(function(){
			getAllApprovedDocs(function(){
				showAvailableFragments(allApprovedDocs, function(){

				});
			});
		});
	}
}

function showNoDataMsgIfNoData(){
	if (!hasData){
		document.getElementById("dataTblDiv").innerHTML = getMsg("NO_RECORDS", "Common");	
	}
}

function clearDataTables(){
	document.getElementById("dataTblDiv").innerHTML = "";
}

function getValidFilteredEmails(allEmails){
	var validSentEmails = [];

	for (var index in allEmails){
		if (allEmails[index].Email_Sent_Date_vod__c != "" && (userId == "" || userId == allEmails[index].CreatedById)){
			validSentEmails.push(allEmails[index]);
		}
	}

	return validSentEmails;
}

function getFragmentName(id){
	for (var approvedDocsIndex in approvedDocs){
		if (approvedDocs[approvedDocsIndex].Id == id){
			return approvedDocs[approvedDocsIndex].Name;
		}
	}
	return "";
}

/**
 * Update the time period shown based on the sent email dates of the filtered emails
 * @param filteredEmails: array of calls that are valid after applying filters
 */
function updateFilteredAeDates(filteredEmails){
	if (filteredEmails[filteredEmails.length - 1] && filteredEmails[filteredEmails.length - 1].Email_Sent_Date_vod__c) {
        document.getElementById("periodStartDate").innerHTML = dateStringToDate(filteredEmails[filteredEmails.length - 1].Email_Sent_Date_vod__c).toLocaleDateString();
	}

	if (filteredEmails[0] && filteredEmails[0].Email_Sent_Date_vod__c) {
        document.getElementById("periodEndDate").innerHTML = dateStringToDate(filteredEmails[0].Email_Sent_Date_vod__c).toLocaleDateString();
	}
}

function createTable(tblId, headerText, headers){
	var newDiv = document.createElement("DIV");
	newDiv.setAttribute("class", "fragmentDataTableDiv");
	newDiv.setAttribute("id", tblId + "Div");

	var newHeaderDiv = document.createElement("DIV");
	newHeaderDiv.innerHTML = headerText;
	newHeaderDiv.setAttribute("class", "dataListHeader");
	newDiv.appendChild(newHeaderDiv);

	var newTbl = document.createElement("TABLE");
    newTbl.setAttribute("id", tblId);
    newTbl.setAttribute("class", "dataTable");
    newTbl.setAttribute("width", "100%");
    newDiv.appendChild(newTbl);

    var header = newTbl.createTHead();
    var tableHeaderRow = header.insertRow(0);

    for (var index in headers){
    	var cell = tableHeaderRow.insertCell(index);
    	cell.setAttribute("class", "fragmentDataTableTh");
    	if (index == 0){
    		cell.setAttribute("style", "border-radius: 3px 0px 0px 0px;");
    	}
    	else if ((parseInt(index) + 1) == headers.length){
    		cell.setAttribute("style", "border-radius: 0px 3px 0px 0px;");
    	}
		cell.innerHTML = headers[index];
    }

    document.getElementById("dataTblDiv").appendChild(newDiv);
}

function initMsgs(callback){
	var msgsToGet = [
		buildVeevaMsgToGet("Period", "Analytics", "Period"),
		buildVeevaMsgToGet("ALL_ACTIVITY", "FieldReporting", "All Activity"),
		buildVeevaMsgToGet("MCCP_MY_ACTIVITY", "Multichannel", "My Activity"),
		buildVeevaMsgToGet("APPROVED_EMAIL_PAGE_SUBTITLE", "ApprovedEmail", "Approved Email"),
		buildVeevaMsgToGet("NO_RECORDS", "Common", "No records to display"),
		buildVeevaMsgToGet("EMAIL_FRAGMENT", "ApprovedEmail", "Email Fragment"),
		buildVeevaMsgToGet("AVAILABLE", "Common", "Available"),
		buildVeevaMsgToGet("APPROVED_EMAIL_SENT", "Multichannel", "Sent")
	];
	
	initMsgCache(msgsToGet, function(){
		callback();
	});
}

function initFieldLabels(callback){
  var queryConfig = {
    object: 'Sent_Email_vod__c',
    fields: ['Email_Sent_Date_vod__c']
  };

  ds.getFieldLabels(queryConfig).then(function(results){
	  fieldLabels.push({labelName: "emailSentDateLabel", labelValue: results[0].display});
	  callback();
  }, showFailure);
}

function updateUIWithMsgs(){
	document.getElementById("aeTitleLabel").innerHTML = getMsg("APPROVED_EMAIL_PAGE_SUBTITLE", "ApprovedEmail");
	document.getElementById("timePeriodLabel").innerHTML = getMsg("Period", "Analytics") + ": ";
	document.getElementById("allActivityBtn").innerHTML = getMsg("ALL_ACTIVITY", "FieldReporting");
	document.getElementById("myActivityBtn").innerHTML = getMsg("MCCP_MY_ACTIVITY", "Multichannel");
	document.getElementById("fragsAvailableTab").innerHTML = getMsg("AVAILABLE", "Common");
	document.getElementById("fragsSentTab").innerHTML = getMsg("APPROVED_EMAIL_SENT", "Multichannel");
}
