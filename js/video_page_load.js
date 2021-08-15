console.log("Livestream Highlighter: Content script loaded")

//0=Initial, 1=Gathering messages, 2=Messages gathered
let current_gathering_state = 0;
//0=Initial, 1=Analyzing messages, 2=Analysis finished
let current_analysis_state = 0;

let menu_is_open = false;
let settings_menu_is_open = false;
const video_length = timestamp_to_seconds(document.getElementsByClassName("ytp-time-duration")[0].textContent);;
let recommended_section = null;
let message_array = [];
let latest_gathering_message_time = null;
//Format: {"group":"Kusa", "start_time":10, "end_time": 40}
let analysis_results = [];

//DEBUGGING USE
let analysis_time_changes = [0, 0, 0, 0, 0, 0];

const default_settings_groups = [{"Name": "Default", 
								  "Enabled": true, 
								  "Time before trend": 15, 
								  "Sensitivity": 0.5, 
								  "Regex filter": new RegExp(""), 
								  "Text to match": [{"String/Regex": "String", "Text": "草"},
													{"String/Regex": "String", "Text": ":virtualhug:"},								  
													{"String/Regex": "String", "Text": "待機"},
													{"String/Regex": "String", "Text": "ちょこん"}]}];
const default_settings_sets = [default_settings_groups];

//A group is a collection of text to look for and that collection's associated settings.
//A set is a group of groups, used for if you want different settings between different types of livestreams
let settings_groups = [];
let settings_sets = [];

//DEBUGGING USE
settings_groups = default_settings_groups;


//HTML elements
const highlights_area = document.createElement("div");
highlights_area.id = "highlights_area";

const highlights_button = document.createElement("button");
highlights_area.appendChild(highlights_button);
highlights_button.id = "highlights_button";
highlights_button.className = "highlights_area_item";
highlights_button.textContent = "LIVESTREAM HIGHLIGHTS";
highlights_button.addEventListener("click", highlights_button_pressed);

const highlights_menu = document.createElement("div");
highlights_menu.id = "highlights_menu";
highlights_menu.className = "highlights_area_item";

const highlights_menu_status_message = document.createElement("p");
highlights_menu_status_message.id = "highlights_menu_status_message";

const settings_menu = document.createElement("div");
settings_menu.id = "settings_menu";
settings_menu.className = "highlights_area_item";

const settings_button = document.createElement("button");
highlights_menu.appendChild(settings_button);
settings_button.id = "settings_button";
settings_button.textContent = "SETTINGS";
settings_button.addEventListener("click", () => {
	settings_menu_is_open = true;
	highlights_menu.removeChild(settings_button);
	highlights_area.insertBefore(settings_menu, highlights_menu);
})

const group_selection_bar = document.createElement("div");
settings_menu.appendChild(group_selection_bar);
group_selection_bar.id = "group_selection_bar";

const group_settings_area = document.createElement("div");
settings_menu.appendChild(group_settings_area);
group_settings_area.id = "group_settings_area";

const save_settings_button = document.createElement("button");
group_settings_area.appendChild(save_settings_button);
save_settings_button.id = "save_settings_button";
save_settings_button.textContent = "DONE";
save_settings_button.addEventListener("click", () => {
	settings_menu_is_open = false;
	highlights_area.removeChild(settings_menu);
	update_main_menu();
})

function timestamp_to_seconds(timestamp) {
	timestamp = timestamp.split(":");
	if(timestamp[0].substr(0, 1) === "-"){
		if(timestamp.length === 2)
			return parseInt(timestamp[0])*60 - parseInt(timestamp[1]);
		if(timestamp.length === 3)
			return parseInt(timestamp[0])*60*60 - parseInt(timestamp[1])*60 - parseInt(timestamp[2]);
	}else{
		if(timestamp.length === 2)
			return parseInt(timestamp[0])*60 + parseInt(timestamp[1]);
		if(timestamp.length === 3)
			return parseInt(timestamp[0])*60*60 + parseInt(timestamp[1])*60 + parseInt(timestamp[2]);
	}
}

//Updates what's shown on the main menu according to the current gathering and analysis states
function update_main_menu(current_analysis_message_time) {
	if(current_gathering_state === 1)
		highlights_menu_status_message.textContent = (latest_gathering_message_time) ? "Gathering chat messages: " + ((latest_gathering_message_time/video_length)*100).toPrecision(3) + "%" : "Gathering chat messages";
	else if(current_analysis_state === 1)
		highlights_menu_status_message.textContent = (current_analysis_message_time) ? "Analyzing live chat " + ((current_analysis_message_time/video_length)*100).toPrecision(3) + "%" : "Analyzing live chat...";
	else
		highlights_menu_status_message.textContent = "";
	
	highlights_menu.innerHTML = "";
	if(!settings_menu_is_open)
		highlights_menu.appendChild(settings_button);
	highlights_menu.appendChild(highlights_menu_status_message);
	append_highlight_moments();
}

function append_highlight_moments() {
	for(index in analysis_results){
		const highlight_moment = document.createElement("div");
		highlight_moment.className = "highlight_moment";
		
		const timestamp_link = document.createElement("a");
		highlight_moment.appendChild(timestamp_link);
		timestamp_link.textContent = analysis_results[index].start_time + " - " + analysis_results[index].end_time;
		timestamp_link.className = "timestamp_link";
		timestamp_link.href = "";
		
		const highlight_group = document.createElement("p");
		highlight_moment.appendChild(highlight_group);
		highlight_group.textContent = "  -  "+ analysis_results[index].group;
		highlight_group.className = "highlight_group_text";

		highlights_menu.appendChild(highlight_moment);
	}
	
}

//Gets the first continuation id from the video page
function get_initial_continuation_ID() {
	return fetch(window.location.href)
	.then(
		(response) => {
			if(response.status !== 200)
				throw "Livestream Highlighter: Error on retrieving initial continuation ID. Error code: " + response.status;
			return response.text();
		})
	.then(
		(data) => {
			const continuation_index = data.indexOf('"continuation":"') + 16;
			return data.substring(continuation_index, data.indexOf('"', continuation_index));
		}
	);
}

//Recursive function that adds the current continuation's messages onto message_array then continues onto the next continuation.
function get_next_continuation(continuation_id, iteration_count) {
	return fetch("https://www.youtube.com/live_chat_replay?continuation=" + continuation_id)
	.then(
		(response) => {
			if(response.status !== 200) {
				console.log("Livestream Highlighter: Error on retrieving continuation ID. Error code: " + response.status)
				return;
			}
			return response.text();
		})
	.then(
		(data) => {
			const chat_object_starting_index = data.indexOf('"liveChatContinuation"', 30259) + 23;
			let chat_object_ending_index = data.indexOf('"trackingParams"', data.length - 370) - 2;
			if(chat_object_ending_index === -3)
				chat_object_ending_index = data.indexOf('};', data.length - 651) - 1;
			
			let chat_info = data.substring(chat_object_starting_index, chat_object_ending_index);
			try{
				chat_info = JSON.parse(chat_info);
			} catch(error){
				console.log(error);
				console.log("DEBUGGING IT_COUNT: " + iteration_count);
				console.log("DEBUGGING START_INDEX:" + chat_object_starting_index)
				console.log("DEBUGGING END_INDEX:" + chat_object_ending_index)
				console.log("DEBUGGING ID: " + continuation_id);
				console.log("DEBUGGING TEXT: " + chat_info);
				return;
			}
			
			for(const chat_item in chat_info.actions) {
				if(chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction !== undefined && chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction.item.liveChatTextMessageRenderer !== undefined)
					message_array.push(chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction.item.liveChatTextMessageRenderer);
			}
			
			console.log(message_array);
			latest_gathering_message_time = timestamp_to_seconds(message_array[message_array.length - 1].timestampText.simpleText);
			update_main_menu();

			if(current_analysis_state === 0){
				current_analysis_state = 1;
				
				let group_analysis_variables = []
				
				for(i in settings_groups){
					group_analysis_variables.push({
										"filter_match_count": 0, 
										"text_match_count": 0, 
										"trend_start_time": null
									   });
					
				}
				analyze_messages(0, 0, 20, true, 1, group_analysis_variables);
			}
			
			try{
				console.log("[" + iteration_count + "] Continuation ID: " + chat_info.continuations[0].liveChatReplayContinuationData.continuation)
			} catch(error) {
				console.log("Reached end of continuations")
				current_gathering_state = 2;
				return;
			}
			
			if(data)
				return get_next_continuation(chat_info.continuations[0].liveChatReplayContinuationData.continuation, iteration_count + 1);
		}
	);
}

function analyze_messages(current_analysis_time, current_righthand_index, analysis_time_width, first_iteration, iteration_count, group_analysis_variables) {
	let current_time = Date.now();
	console.log("Checkpoint 1: " + current_time);
	last_checkpoint_time = current_time;
	
	
	for(let i = 0; i < 100; i++){
		if(current_gathering_state === 2 && video_length - current_analysis_time <= analysis_time_width){
			console.log("Livestream Highligher: Finished analysis")
			console.log("Iteration count: " + iteration_count);
			console.log("Current Second: " + current_analysis_time);
			current_analysis_state = 2;
			console.log(analysis_time_changes);
			update_main_menu();
			return;
		}
		
		if(current_gathering_state === 2 || latest_gathering_message_time > current_analysis_time + analysis_time_width){
			current_time = Date.now();
			console.log("Checkpoint 2: " + current_time);
			if(current_time > last_checkpoint_time)
				analysis_time_changes[1]+= current_time - last_checkpoint_time;
			last_checkpoint_time = current_time;
			
			if(current_analysis_time % 100 === 0)
				console.log("Analysis time: " + current_analysis_time + " " + message_array.length + " " + current_righthand_index);
			
			if(first_iteration){
				console.log(message_array);
				console.log("Position 1: [" + current_righthand_index + "]")
				console.log(message_array[0]);
				try{
					while(current_righthand_index !== message_array.length && timestamp_to_seconds(message_array[current_righthand_index].timestampText.simpleText) < current_analysis_time + analysis_time_width){
						//Filtering and trend matching for first iteration
						console.log("Current righthand index: " + current_righthand_index + " at time " + message_array[current_righthand_index].timestampText.simpleText);
						
						for(let i = 0; i < settings_groups.length; i++){
							if(settings_groups[i]["Regex filter"].test(message_array[current_righthand_index])){
								console.log("Position 2: [" + current_righthand_index + "]")
								console.log(message_array[0]);
								console.log("Passed Regex filter");
								
								for(let j = 0; j < settings_groups[i]["Text to match"].length; j++){
									for(let part_of_message = 0; part_of_message < message_array[current_righthand_index].message.runs.length; part_of_message++){
										let message_part = "";
										console.log("Position 3: [" + current_righthand_index + "]")
										console.log(message_array[0]);
										console.log("Position 4: [" + current_righthand_index + "]")
										console.log(message_array[current_righthand_index]);
										if(message_array[current_righthand_index].message.runs[part_of_message].text)
											message_part = message_array[current_righthand_index].message.runs[part_of_message].text;
										else if(message_array[current_righthand_index].message.runs[part_of_message].emoji)
											message_part = message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts[message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts.length - 1];
										else
											continue;
										
										console.log("Current message part: " + message_part)
										
										if(!message_part)
											console.log(message_array[current_righthand_index])
										
										if(settings_groups[i]["Text to match"]["String/Regex"] === "Regex" && settings_groups[i]["Text to match"].Text.test(message_part)){
											group_analysis_variables[i].text_match_count += 1;
											break;
										}
										else if(message_part.includes(settings_groups[i]["Text to match"][j].Text)){
											console.log(message_array[current_righthand_index].timestampText.simpleText + " - " + settings_groups[i]["Text to match"][j].Text)
											group_analysis_variables[i].text_match_count += 1;
											break;
										}
									}
								}
								group_analysis_variables[i].filter_match_count += 1;
							}
						}
						current_righthand_index++;
					}	
					first_iteration = false;
					console.log("First righthand index: " + current_righthand_index);
				} catch(error) {
					console.log(error);
					console.log(message_array[current_righthand_index]);
					console.log("Current righthand index: " + current_righthand_index + ", array max index: " + (message_array.length - 1))
					return;
				}
			}
			
			for(let group_index = 0; group_index < group_analysis_variables.length; group_index++){
				console.log("Trend logic: Group [" + group_index + "] - " + group_analysis_variables[group_index].text_match_count + " : " + group_analysis_variables[group_index].filter_match_count);
				if(group_analysis_variables[group_index].text_match_count/group_analysis_variables[group_index].filter_match_count >= settings_groups[group_index]["Sensitivity"])
					console.log("Trend detected at " + current_analysis_time + " - " + group_analysis_variables[group_index].text_match_count/group_analysis_variables[group_index].filter_match_count + " - " + settings_groups[group_index]["Name"]);
			}
			
			console.log("Incrementing analysis time: " + current_analysis_time++);
			
			try{
				console.log("DEBUGGING BEFORE LEFTSIDE: [" + current_righthand_index + "] - " + timestamp_to_seconds(message_array[current_righthand_index].timestampText.simpleText) + " =?= " + (current_analysis_time + analysis_time_width));
			} catch (error) {
				console.log("Error: " + error);
				console.log("current_gathering_state: " + 2);
				console.log("latest_gathering_message_time: " + latest_gathering_message_time);
				console.log("analysis time range limit: " + (current_analysis_time + analysis_time_width));
				return;
			}
			//Removes all messages before the new current_analysis_time and decreases match counts if any removed messages match
			while(timestamp_to_seconds(message_array[0].timestampText.simpleText) < current_analysis_time){
				for(let i = 0; i < settings_groups.length; i++){
					if(settings_groups[i]["Regex filter"].test(message_array[0])){
						console.log("Passed Regex filter");
						console.log(message_array[0]);
						for(let j = 0; j < settings_groups[i]["Text to match"].length; j++){
							for(let part_of_message = 0; part_of_message < message_array[0].message.runs.length; part_of_message++){
								let message_part = "";
								if(message_array[0].message.runs[part_of_message].text)
									message_part = message_array[0].message.runs[part_of_message].text;
								else if(message_array[0].message.runs[part_of_message].emoji)
									message_part = message_array[0].message.runs[part_of_message].emoji.shortcuts[message_array[0].message.runs[part_of_message].emoji.shortcuts.length - 1];
								else
									continue;
								
								console.log("Current message part: " + message_part)
								
								if(!message_part)
									console.log(message_array[0])
								if(settings_groups[i]["Text to match"]["String/Regex"] === "Regex" && settings_groups[i]["Text to match"].Text.test(message_part)){
									group_analysis_variables[i].text_match_count -= 1;
									break;
								}
								else if(message_part.includes(settings_groups[i]["Text to match"][j].Text)){
									console.log(message_array[0].timestampText.simpleText + " - " + settings_groups[i]["Text to match"][j].Text)
									group_analysis_variables[i].text_match_count -= 1;
									break;
								}
							}
						}
						group_analysis_variables[i].filter_match_count -= 1;
					}
				}
				console.log(message_array);
				console.log(message_array[0]);
				console.log("current_righthand_index: " + current_righthand_index);
				console.log("current_analysis_time: " + current_analysis_time)
				message_array.shift();
					current_righthand_index--;
				console.log(message_array);
				console.log(message_array[0]);
				console.log("current_righthand_index: " + current_righthand_index);
				console.log("current_analysis_time: " + current_analysis_time)
			}
			
			try {
				console.log("DEBUGGING BEFORE RIGHTSIDE: [" + current_righthand_index + "] - " + timestamp_to_seconds(message_array[current_righthand_index].timestampText.simpleText) + " =?= " + (current_analysis_time + analysis_time_width));
			} catch (error) {
				console.log("Error: " + error);
				console.log("current_gathering_state: " + 2);
				console.log("latest_gathering_message_time: " + latest_gathering_message_time);
				console.log("analysis time range limit: " + (current_analysis_time + analysis_time_width));
				console.log("current_righthand_index: " + current_righthand_index + "\message_array length: " + message_array.length);
				return;
			}
			
			//Finds the index of the first message that isn't the current analysis time + analysis width and sets it to current_righthand_index
			while(current_righthand_index !== message_array.length && timestamp_to_seconds(message_array[current_righthand_index].timestampText.simpleText) === current_analysis_time + analysis_time_width){
				console.log("Index heading right! Currently at " + current_righthand_index);
				for(let i = 0; i < settings_groups.length; i++){
					if(settings_groups[i]["Regex filter"].test(message_array[current_righthand_index])){
						console.log("Passed Regex filter");
						console.log(message_array[current_righthand_index]);
						for(let j = 0; j < settings_groups[i]["Text to match"].length; j++){
							for(let part_of_message = 0; part_of_message < message_array[current_righthand_index].message.runs.length; part_of_message++){
								let message_part = "";
								if(message_array[current_righthand_index].message.runs[part_of_message].text)
									message_part = message_array[current_righthand_index].message.runs[part_of_message].text;
								else if(message_array[current_righthand_index].message.runs[part_of_message].emoji)
									message_part = message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts[message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts.length - 1];
								else
									continue;
								
								console.log("Current message part: " + message_part)
								
								if(!message_part)
									console.log(message_array[current_righthand_index])
								if(settings_groups[i]["Text to match"]["String/Regex"] === "Regex" && settings_groups[i]["Text to match"].Text.test(message_part)){
									group_analysis_variables[i].text_match_count += 1;
									break;
								}
								else if(message_part.includes(settings_groups[i]["Text to match"][j].Text)){
									console.log(message_array[current_righthand_index].timestampText.simpleText + " - " + settings_groups[i]["Text to match"][j].Text)
									group_analysis_variables[i].text_match_count += 1;
									break;
								}
							}
						}
						group_analysis_variables[i].filter_match_count += 1;
					}
				}
				
				current_righthand_index++;
			}
			
			//TODO: Test righthand index accuracy
			console.log("DEBUGGING AFTER RIGHTSIDE: current_righthand_index: " + current_righthand_index);
			console.log(message_array[current_righthand_index]);
			console.log(message_array[current_righthand_index - 1]);
			
			current_time = Date.now();
			console.log("Checkpoint 3: " + current_time);
			if(current_time > last_checkpoint_time)
				analysis_time_changes[2]+= current_time - last_checkpoint_time;
			last_checkpoint_time = current_time;
		}
		
		current_time = Date.now();
		console.log("Checkpoint 4: " + current_time);
		if(current_time > last_checkpoint_time)
			analysis_time_changes[3]+= current_time - last_checkpoint_time;
		last_checkpoint_time = current_time;
		
		if(current_analysis_time % 100 === 0)
			update_main_menu(current_analysis_time);
	}
	current_time = Date.now();
	console.log("Checkpoint 5: " + current_time);
	if(current_time > last_checkpoint_time)
		analysis_time_changes[4]+= current_time - last_checkpoint_time;
	last_checkpoint_time = current_time;
	
	setTimeout(analyze_messages, 0, current_analysis_time, current_righthand_index, analysis_time_width, false, iteration_count + 1, group_analysis_variables);
	
	current_time = Date.now();
	console.log("Checkpoint 6: " + current_time);
	if(current_time > last_checkpoint_time)
		analysis_time_changes[5]+= current_time - last_checkpoint_time;
	last_checkpoint_time = current_time;
}

async function highlights_button_pressed() {
	console.log("Highlights button pressed");
	if(menu_is_open){
		if(settings_menu_is_open)
			highlights_area.removeChild(settings_menu);
		highlights_area.removeChild(highlights_menu);
		menu_is_open = false;
	} else {
		if(settings_menu_is_open)
			highlights_area.appendChild(settings_menu);
		highlights_area.appendChild(highlights_menu);
		menu_is_open = true;
	}
	
	if(current_gathering_state === 0){
		current_gathering_state = 1;
		update_main_menu();
		
		const initial_continuation_id = await get_initial_continuation_ID();
		console.log("initial_continuation_id: " + initial_continuation_id);
		await get_next_continuation(initial_continuation_id, 0);
		
		update_main_menu();
		append_highlight_moments();
	} else {
		console.log("Route 2")
	}
}

//Sometimes, DOM insertion fails because the page loads too slowly. This listener  
//prevents this by checking for failure twice a second for 30 seconds
window.addEventListener("load", () => {
	if(!document.getElementById("highlights_area") && document.getElementById("chat") && document.getElementById("comments")){
		console.log("Livestream Highlighter: Inserting Highlights Area");
		recommended_section = document.getElementById("related");
		document.getElementById("related").parentNode.insertBefore(highlights_area, recommended_section)
	}
	
	let retry_count = 0;
	var retry_interval = setInterval(() => {
		if(!document.getElementById("highlights_area") && document.getElementById("chat") && document.getElementById("comments")){
			console.log("Livestream Highlighter: Inserting Highlights Area");
			recommended_section = document.getElementById("related");
			document.getElementById("related").parentNode.insertBefore(highlights_area, recommended_section)
		}
		retry_count++;
		if(retry_count >= 60)
			window.clearInterval(retry_interval);
	}, 500);
});


