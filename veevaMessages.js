var msgCache = [];
var languageLocaleKey = "";

/**
 * Create object for getting a veeva message
 */
function buildVeevaMsgToGet(msgName, msgCategory, msgDefault){
	return { msgName: msgName, msgCategory: msgCategory, msgDefault: msgDefault};
}

function initMsgCache(msgsToGet, callback){
	getUserLanguage(function(lang){
		languageLocaleKey = lang;

		window.ds.getVeevaMessagesWithDefault(msgsToGet,languageLocaleKey).then(function(response){
			msgCache = response;
			callback();
		});
	});
}

function getUserLanguage(callback){
	window.ds.getDataForCurrentObject("User", "LanguageLocaleKey").then(function(results){
        if (results.success){
            callback(results["User"].LanguageLocaleKey);
        } else{
            showFailure(results);
            callback("en_US");
        }
	});
}

function getMsg(msgName, msgCategory){
	var output = '';

	msgCache.forEach(function(message){
		if (message.Name.value === msgName && message.Category_vod__c.value === msgCategory) {
			output = message.Text_vod__c.display;
		}
	});

	return output;
}
