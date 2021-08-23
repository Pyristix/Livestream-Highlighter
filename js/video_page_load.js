console.log("Livestream Highlighter: Content script loaded")

let root_url = "https://www.youtube.com/watch?v=" + window.location.href.split("v=")[1].split("&")[0];

//0=Initial, 1=Gathering messages, 2=Messages gathered
let current_gathering_state = 0;
//0=Initial, 1=Analyzing messages, 2=Analysis finished
let current_analysis_state = 0;

let menu_is_open = false;
let settings_menu_is_open = false;
let video_length = null;
let recommended_section = null;
let message_array = [];
let latest_gathering_message_time = null;
let next_continuation_id = "";
var progress_save_interval = null;

let currently_used_settings_set_index = 0;
let currently_viewing_settings_group_index = 0;

//DEBUGGING USE
let analysis_time_changes = [0, 0, 0, 0, 0, 0];

const default_settings_groups = [{"Name": "Funny", 
								  "Enabled": true, 
								  "Time before trend": 15, 
								  "Sensitivity": 0.5, 
								  "Regex filter": new RegExp(""), 
								  "Text to match": [{"String/Regex": "String", "Text": "草"},
													{"String/Regex": "String", "Text": "w"}]},
								 {"Name": "Cute", 
								  "Enabled": true, 
								  "Time before trend": 15, 
								  "Sensitivity": 0.5, 
								  "Regex filter": new RegExp("/[一-龠]|[ぁ-ゔ]|[ァ-ヴー]|[ａ-ｚＡ-Ｚ０-９]|[々〆〤]/u"), 
								  "Text to match": [{"String/Regex": "String", "Text": "かわいい"},
													{"String/Regex": "String", "Text": "可愛い"}]},
								 {"Name": "ちょこん1", 
								  "Enabled": true, 
								  "Time before trend": 15, 
								  "Sensitivity": 0.5, 
								  "Regex filter": new RegExp("/[一-龠]|[ぁ-ゔ]|[ァ-ヴー]|[ａ-ｚＡ-Ｚ０-９]|[々〆〤]/u"), 
								  "Text to match": [{"String/Regex": "String", "Text": "ちょこん"}]},
								 {"Name": "ちょこん2", 
								  "Enabled": true, 
								  "Time before trend": 15, 
								  "Sensitivity": 0.5, 
								  "Regex filter": new RegExp(""), 
								  "Text to match": [{"String/Regex": "String", "Text": "ちょこん"}]},
								 {"Name": "待機", 
								  "Enabled": true, 
								  "Time before trend": 15, 
								  "Sensitivity": 0.5, 
								  "Regex filter": new RegExp(""), 
								  "Text to match": [{"String/Regex": "Regex", "Text": new RegExp("待機")}]}];

const default_settings_sets = [{"name" : "Default Settings", 
								"groups" : default_settings_groups}];

//A group is a collection of text to look for and that collection's associated settings.
//A set is a group of groups, used for if you want different settings between different types of livestreams
let settings_sets = [];
let settings_groups = [];

//Changes from the settings menu affect this until the changes are saved.
let unsaved_settings_sets = [];
let unsaved_settings_groups = [];
let unsaved_settings_savable = true;

//DEBUGGING USE
//settings_groups = default_settings_groups;
//settings_sets = default_settings_sets;

load_settings();
//save_settings();

chrome.storage.local.get("livestream_highlighter_settings", (results) => {
	console.log(results)
})

//console.log(typeof settings_groups[1]["Regex filter"])
//console.log(typeof settings_groups[4]["Text to match"][0]["Text"])

console.log(settings_sets);
console.log(settings_groups);




//Format: {"group":"Kusa", "start_time":10, "end_time": 40}
let analysis_results = [];

//Default analysis variables that act like parameters for analyze_messages
//Format: [current_analysis_time, current_righthand_index, analysis_time_width, iteration_count]
let initial_analysis_variables = [-1, 0, 20, 1];

//Group analysis variables(counts, etc.) for enabled settings groups
let group_analysis_variables = [];
//Stores only enabled settings groups
let enabled_settings_groups = [];



//Loads previously analyzed results and progress in gathering and analysis
//Format for the stored data: [root_url, analysis_results, next_continuation_id, message_array, {parameters of analyze_messages}]
chrome.storage.local.get("livestream_highlighter_progress", (results) => {
	console.log(results)
	if(results["livestream_highlighter_progress"] !== null && results["livestream_highlighter_progress"][0] === root_url){
		next_continuation_id = results["livestream_highlighter_progress"][2];
		message_array = results["livestream_highlighter_progress"][3];
		initial_analysis_variables = results["livestream_highlighter_progress"][5];
		
		if(next_continuation_id === "DONE!")
			current_gathering_state = 2;
		if(initial_analysis_variables[0] === "DONE!")
			current_analysis_state = 2;
		
		analysis_results = results["livestream_highlighter_progress"][1]
		video_length = results["livestream_highlighter_progress"][4];
		
		//Resets the variable for determining whether or not you came to the page from clicking a highlight timestamp
		chrome.storage.local.get("livestream_highlighter_timestamp_click", (results) => {
			if(results["livestream_highlighter_timestamp_click"] === true){
				chrome.storage.local.set({"livestream_highlighter_timestamp_click" : false});
				highlights_button_pressed();
			}
		})
	}
	//The code for setting this data
	//chrome.storage.local.set({"livestream_highlighter_gathering_analysis_progress": null});
	//chrome.storage.local.set({"livestream_highlighter_gathering_analysis_progress": [root_url, analysis_results, next_continuation_id, message_array, video_length, [current_analysis_time, current_righthand_index, analysis_time_width, iteration_count, group_analysis_variables]]});
})



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
	update_settings_menu();
})

const set_selection_bar = document.createElement("div");
settings_menu.appendChild(set_selection_bar);
set_selection_bar.id = "set_selection_bar";
const group_selection_bar = document.createElement("div");
settings_menu.appendChild(group_selection_bar);
group_selection_bar.id = "group_selection_bar";
const group_settings_area = document.createElement("div");
settings_menu.appendChild(group_settings_area);
group_settings_area.id = "group_settings_area";


const settings_management_buttons_area	= document.createElement("div");
settings_management_buttons_area.className = "group_settings_subdiv";
settings_management_buttons_area.id = "settings_management_buttons_area";
const help_button = document.createElement("button");
settings_management_buttons_area.appendChild(help_button);
help_button.textContent = "?";
help_button.addEventListener("click", () => {
	window.open("https://www.google.com", "_blank");
});
const delete_set_button = document.createElement("button");
settings_management_buttons_area.appendChild(delete_set_button);
delete_set_button.textContent = "Delete Set";
const delete_group_button = document.createElement("button");
settings_management_buttons_area.appendChild(delete_group_button);
delete_group_button.textContent = "Delete Group";

const regex_filter_area = document.createElement("div");
regex_filter_area.className = "group_settings_subdiv";
regex_filter_area.id = "regex_filter_area";
const filter_regex_input_label = document.createElement("label");
regex_filter_area.appendChild(filter_regex_input_label);
filter_regex_input_label.setAttribute("for", "filter_regex_input");
filter_regex_input_label.textContent = "Group Regex Filter";
const filter_regex_input = document.createElement("input");
regex_filter_area.appendChild(filter_regex_input);
filter_regex_input.setAttribute("type", "text");
filter_regex_input.id = "filter_regex_input";


const overall_group_settings_area = document.createElement("div");
overall_group_settings_area.className = "group_settings_subdiv"
overall_group_settings_area.id = "overall_group_settings_area";
const enable_group_button_label = document.createElement("label");
overall_group_settings_area.appendChild(enable_group_button_label);
enable_group_button_label.setAttribute("for", "enable_group_button");
enable_group_button_label.textContent = "Group enabled: ";
const enable_group_button = document.createElement("input");
overall_group_settings_area.appendChild(enable_group_button);
enable_group_button.setAttribute("type", "checkbox");
enable_group_button.id = "enable_group_button";
const time_offset_label = document.createElement("label");
overall_group_settings_area.appendChild(time_offset_label);
time_offset_label.setAttribute("for", "time_offset_input");
time_offset_label.textContent = "Time offset(s): ";
const time_offset_input = document.createElement("input");
overall_group_settings_area.appendChild(time_offset_input);
time_offset_input.setAttribute("type", "number");
time_offset_input.id = "time_offset_input";
const sensitivity_label = document.createElement("label");
overall_group_settings_area.appendChild(sensitivity_label);
sensitivity_label.setAttribute("for", "sensitivity_input");
sensitivity_label.textContent = "Sensitivity: ";
sensitivity_label.id = "sensitivity_label";
const sensitivity_input = document.createElement("input");
overall_group_settings_area.appendChild(sensitivity_input);
sensitivity_input.setAttribute("type", "number");
sensitivity_input.id = "sensitivity_input";



const trend_indicators_area = document.createElement("div");
trend_indicators_area.id = "trend_indicators_area";


const save_settings_button = document.createElement("button");
group_settings_area.appendChild(save_settings_button);
save_settings_button.id = "save_settings_button";
save_settings_button.textContent = "SAVE";
save_settings_button.addEventListener("click", () => {
	if(unsaved_settings_savable){
		settings_menu_is_open = false;
		highlights_area.removeChild(settings_menu);
		update_main_menu();
		highlights_button_pressed();
		settings_sets = JSON.parse(JSON.stringify(unsaved_settings_sets));
		settings_groups = JSON.parse(JSON.stringify(unsaved_settings_groups));
		save_settings();
		chrome.storage.local.set({"livestream_highlighter_progress": null});
		console.error("Testing console.error")
		reset_gathering_analysis_variables();
		highlights_button_pressed();
	}
})
const cancel_settings_button = document.createElement("button");
group_settings_area.appendChild(cancel_settings_button);
cancel_settings_button.id = "cancel_settings_button";
cancel_settings_button.textContent = "CANCEL";
cancel_settings_button.addEventListener("click", () => {
	settings_menu_is_open = false;
	highlights_area.removeChild(settings_menu);
	console.log(settings_sets);
	console.log(settings_groups);
	console.log(unsaved_settings_sets);
	console.log(unsaved_settings_groups);
	reset_unsaved_settings();
	console.log(unsaved_settings_sets);
	console.log(unsaved_settings_groups);
	update_main_menu();
});

function convert_settings_regexes_to_strings() {
	for(let set_index = 0; set_index < settings_sets.length; set_index++){
		for(let group_index = 0; group_index < settings_sets[set_index]["groups"].length; group_index++){
			//Regex for group filter
			if(settings_sets[set_index]["groups"][group_index]["Regex filter"].source === "(?:)")
				settings_sets[set_index]["groups"][group_index]["Regex filter"] = "";
			else
				settings_sets[set_index]["groups"][group_index]["Regex filter"] = settings_sets[set_index]["groups"][group_index]["Regex filter"].source;
			
			//Regex for individual indicator regex
			for(let indicator_index = 0; indicator_index < settings_sets[set_index]["groups"][group_index]["Text to match"].length; indicator_index++){
				if(settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["String/Regex"] === "Regex"){
					if(settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"].source === "(?:)")
						settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"] = "";
					else
						settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"] = settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"].source;
				}
			}
		}
	}
}

function convert_settings_strings_to_regexes(settings_sets_copy) {
	if(settings_sets_copy){
		for(let set_index = 0; set_index < settings_sets_copy.length; set_index++){
			for(let group_index = 0; group_index < settings_sets_copy[set_index]["groups"].length; group_index++){
				//Regex for group filter
				settings_sets_copy[set_index]["groups"][group_index]["Regex filter"] = new RegExp(settings_sets_copy[set_index]["groups"][group_index]["Regex filter"]);
				
				//Regex for individual indicator regex
				for(let indicator_index = 0; indicator_index < settings_sets_copy[set_index]["groups"][group_index]["Text to match"].length; indicator_index++)
					if(settings_sets_copy[set_index]["groups"][group_index]["Text to match"][indicator_index]["String/Regex"] === "Regex")
						settings_sets_copy[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"] = new RegExp(settings_sets_copy[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"]);
			}
		}
	} else {
		for(let set_index = 0; set_index < settings_sets.length; set_index++){
			for(let group_index = 0; group_index < settings_sets[set_index]["groups"].length; group_index++){
				//Regex for group filter
				settings_sets[set_index]["groups"][group_index]["Regex filter"] = new RegExp(settings_sets[set_index]["groups"][group_index]["Regex filter"]);
				
				//Regex for individual indicator regex
				for(let indicator_index = 0; indicator_index < settings_sets[set_index]["groups"][group_index]["Text to match"].length; indicator_index++)
					if(settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["String/Regex"] === "Regex")
						settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"] = new RegExp(settings_sets[set_index]["groups"][group_index]["Text to match"][indicator_index]["Text"]);
			}
		}
	}
}

function save_settings() {
	convert_settings_regexes_to_strings();
	console.log(settings_sets);
	chrome.storage.local.set({"livestream_highlighter_settings" : [0, settings_sets_to_save]});
	convert_settings_strings_to_regexes();
}

function load_settings() {
	chrome.storage.local.get("livestream_highlighter_settings", (results) => {
		console.log(results)
		if(results["livestream_highlighter_settings"].length){
			settings_sets = results["livestream_highlighter_settings"][1];
			unsaved_settings_sets = JSON.parse(JSON.stringify(settings_sets));
			
			convert_settings_strings_to_regexes();
			convert_settings_strings_to_regexes(unsaved_settings_sets);

			currently_used_settings_set_index = results["livestream_highlighter_settings"][0]
			settings_groups = settings_sets[results["livestream_highlighter_settings"][0]]["groups"];
			unsaved_settings_groups = unsaved_settings_sets[results["livestream_highlighter_settings"][0]]["groups"];

			console.log("Livestream Highlighter: Settings retrieved");
		} else {
			settings_sets = default_settings_sets;
			settings_groups = default_settings_groups;
		}
		
		//Inserts empty defaults for group_analysis_variables for each trend group (now that the trend groups are loaded)
		for(i in settings_groups){
			if(settings_groups[i]["Enabled"]){
				group_analysis_variables.push({
											"filter_match_count": 0, 
											"text_match_count": 0, 
											"trend_start_time": null
										});
				enabled_settings_groups.push(settings_groups[i]);
			}
		}
		console.log(initial_analysis_variables);
		console.log(settings_sets);
		console.log(settings_groups);
		console.log(enabled_settings_groups);
	})
}

function reset_unsaved_settings() {
	convert_settings_regexes_to_strings();
	unsaved_settings_sets = JSON.parse(JSON.stringify(settings_sets));
	convert_settings_strings_to_regexes(unsaved_settings_sets);
	convert_settings_strings_to_regexes();
	
	currently_used_settings_set_index = Math.min(currently_used_settings_set_index, unsaved_settings_sets.length - 1);
	currently_viewing_settings_group_index = Math.min(currently_viewing_settings_group_index, unsaved_settings_groups.length - 1);

	unsaved_settings_groups = unsaved_settings_sets[currently_used_settings_set_index]["groups"];
}

//Returns a number of seconds from a 00:00:00 formatted timestamp.
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

//Returns a 00:00:00 formatted timestamp from a number of seconds.
function seconds_to_timestamp(seconds) {
	let negative = (seconds < 0) ? true : false;
	seconds = Math.abs(seconds);
	
	let seconds_minutes_hours = [seconds % 60];
	seconds_minutes_hours.push(((seconds - seconds_minutes_hours[0]) / 60) % 60);
	seconds_minutes_hours.push((seconds - seconds_minutes_hours[1]*60 - seconds_minutes_hours[0]) / 3600);
	
	for(let i = 0; i < 3; i++)
		if(seconds_minutes_hours[i] < 10)
			seconds_minutes_hours[i] = "0" + seconds_minutes_hours[i];
	
	if(negative)
		return "-" + seconds_minutes_hours[2] + ":" + seconds_minutes_hours[1] + ":" + seconds_minutes_hours[0];
	else
		return seconds_minutes_hours[2] + ":" + seconds_minutes_hours[1] + ":" + seconds_minutes_hours[0];
}

function update_settings_menu() {
	settings_menu.innerHTML = "";
	set_selection_bar.innerHTML = "";
	group_selection_bar.innerHTML = "";
	group_settings_area.innerHTML = "";
	trend_indicators_area.innerHTML = "";
	
	settings_menu.appendChild(set_selection_bar);
	settings_menu.appendChild(group_selection_bar);
	settings_menu.appendChild(group_settings_area);
	
	currently_used_settings_set_index = Math.min(currently_used_settings_set_index, unsaved_settings_sets.length - 1);
	currently_viewing_settings_group_index = Math.min(currently_viewing_settings_group_index, unsaved_settings_groups.length - 1);

	unsaved_settings_groups = unsaved_settings_sets[currently_used_settings_set_index]["groups"];
	
	//Append sets
	for(let i = 0; i < unsaved_settings_sets.length; i++){
		const settings_set_button = document.createElement("button");
		settings_set_button.className = "settings_set_button";
		settings_set_button.addEventListener("click",() => {
			currently_used_settings_set_index = i;
			update_settings_menu();
		});
		const settings_set_name = document.createElement("input");
		settings_set_button.appendChild(settings_set_name);
		settings_set_name.className = "settings_set_name";
		settings_set_name.setAttribute("type", "text");
		settings_set_name.value = unsaved_settings_sets[i]["name"];
		settings_set_name.addEventListener("click",() => {
			if(settings_set_button.className.split(" ").length === 2) //If currently selected
				event.stopPropagation();
		});
		
		set_selection_bar.appendChild(settings_set_button);
		
		if(i === currently_used_settings_set_index){
			settings_set_button.className = "settings_set_button currently_selected_settings_button";
			settings_set_name.className = "settings_set_name currently_selected_settings_name";
		}
	}
	
	//Append "add set" button
	const add_set_button = document.createElement("button");
	set_selection_bar.appendChild(add_set_button);
	add_set_button.className = "add_item_button";
	add_set_button.textContent = "+";
	add_set_button.addEventListener("click", () => {
		unsaved_settings_sets.push({"name": "New Set", "groups": [{
															"Name": "New Group", 
															"Enabled": true, 
															"Time before trend": 15, 
															"Sensitivity": 0.5, 
															"Regex filter": new RegExp(""), 
															"Text to match": []
														  }]
		});
		currently_used_settings_set_index = unsaved_settings_sets.length - 1;
		currently_viewing_settings_group_index = 0;
		update_settings_menu();
	});

	//Append groups
	for(let i = 0; i < unsaved_settings_groups.length; i++){
		const settings_group_button = document.createElement("button");
		settings_group_button.className = "settings_group_button";
		settings_group_button.addEventListener("click", () => {
			currently_viewing_settings_group_index = i;
			update_settings_menu();
		});
		const settings_group_name = document.createElement("input");
		settings_group_button.appendChild(settings_group_name);
		settings_group_name.className = "settings_group_name";
		settings_group_name.setAttribute("type", "text");
		settings_group_name.value = unsaved_settings_groups[i]["Name"];
		settings_group_name.addEventListener("click",() => {
			if(settings_group_button.className.split(" ").length === 2) //If currently selected
				event.stopPropagation();
		});
		
		group_selection_bar.appendChild(settings_group_button);
		
		if(i === currently_viewing_settings_group_index){
			settings_group_button.className = "settings_group_button currently_selected_settings_button";
			settings_group_name.className = "settings_group_name currently_selected_settings_name";
		}
	}
	
	let duplicate_name_exists = false;
	
	//Check group name uniqueness
	for(i in unsaved_settings_sets){
		let group_name_array = [];
		for(j in unsaved_settings_sets[i]["groups"])
			group_name_array.push(unsaved_settings_sets[i]["groups"][j]["Name"]);
		if((new Set(group_name_array)).size !== group_name_array.length){
			const duplicate_group_warning_message = document.createElement("p");
			group_selection_bar.appendChild(duplicate_group_warning_message);
			duplicate_group_warning_message.className = "warning_message";
			duplicate_group_warning_message.textContent = 'Duplicate group name in set "' + unsaved_settings_sets[i]["name"] + '"';
			
			unsaved_settings_savable = false;
			duplicate_name_exists = true;
			break;
		}
	}
	
	//Append "Add group" button
	if(!duplicate_name_exists){
		const add_group_button = document.createElement("button");
		group_selection_bar.appendChild(add_group_button);
		add_group_button.className = "add_item_button";
		add_group_button.textContent = "+";
		add_group_button.addEventListener("click", () => {
			unsaved_settings_sets[currently_used_settings_set_index]["groups"].push({
																"Name": "New Group", 
																"Enabled": true, 
																"Time before trend": 15, 
																"Sensitivity": 0.5, 
																"Regex filter": new RegExp(""), 
																"Text to match": []
															  }
			);
			currently_viewing_settings_group_index = unsaved_settings_groups.length - 1;
			update_settings_menu();
		});
	}
	
	
	if(!unsaved_settings_sets){ //If empty
		const create_set_warning_message = document.createElement("p");
		group_settings_area.appendChild(create_set_warning_message);
		create_set_warning_message.className = "warning_message";
		create_set_warning_message.textContent = "Create a new set to begin";
	} else {
		group_settings_area.appendChild(settings_management_buttons_area);
		group_settings_area.appendChild(regex_filter_area);
		const raw_regex = unsaved_settings_sets[currently_used_settings_set_index]["groups"][currently_viewing_settings_group_index]["Regex filter"];
		console.log(unsaved_settings_sets);
		console.log(currently_used_settings_set_index);
		console.log(currently_viewing_settings_group_index);
		if(raw_regex.source !== "(?:)")
			filter_regex_input.value = raw_regex.source;
		else
			filter_regex_input.value = "";
		group_settings_area.appendChild(overall_group_settings_area);

		group_settings_area.appendChild(trend_indicators_area);
		
		
		group_settings_area.appendChild(save_settings_button);
		group_settings_area.appendChild(cancel_settings_button);
	}
	
	

	
	//Append trend indicators
	//for(let i = 0; i < ; i++)
	
	//TODO: Refresh settings menu in all areas.
}

//Updates what's shown on the main menu according to the current gathering and analysis states
function update_main_menu(current_analysis_message_time) {
	if(current_gathering_state === 1)
		highlights_menu_status_message.innerHTML = (latest_gathering_message_time && video_length) ? "Gathering chat messages: " + ((latest_gathering_message_time/video_length)*100).toPrecision(3) + "%<br /><br /><p class='progress_timestamps'>" + seconds_to_timestamp(latest_gathering_message_time) + " / " + seconds_to_timestamp(video_length) + "</p>" : "Gathering chat messages";
	else if(current_analysis_state === 1)
		highlights_menu_status_message.innerHTML = (current_analysis_message_time && video_length) ? "Analyzing live chat " + ((current_analysis_message_time/video_length)*100).toPrecision(3) + "%" : "Analyzing live chat...";
	else
		highlights_menu_status_message.innerHTML = "";
	
	highlights_menu.innerHTML = "";
	if(!settings_menu_is_open)
		highlights_menu.appendChild(settings_button);
	if(current_analysis_state !== 2)
		highlights_menu.appendChild(highlights_menu_status_message);
	//if(current_analysis_state === 2)
	append_highlight_moments();
}

function append_highlight_moments() {
	for(index in analysis_results){
		const highlight_moment = document.createElement("div");
		highlight_moment.className = "highlight_moment";
		if(index === "0")
			highlight_moment.className = "highlight_moment first_highlight";
		
		const timestamp_link = document.createElement("a");
		highlight_moment.appendChild(timestamp_link);
		for(const group_index in settings_groups){
			if(settings_groups[group_index]["Name"] === analysis_results[index].group){
				timestamp_link.textContent = seconds_to_timestamp(analysis_results[index].start_time - settings_groups[group_index]["Time before trend"]) + " - " + seconds_to_timestamp(analysis_results[index].end_time);
				timestamp_link.href = "https://youtu.be/" + root_url.split("?v=")[1] + "?t=" + (analysis_results[index].start_time - settings_groups[group_index]["Time before trend"]);
				break;
			}
		}
		timestamp_link.className = "timestamp_link";
		timestamp_link.addEventListener("click", () => {
			chrome.storage.local.set({"livestream_highlighter_timestamp_click" : true});
		});
		
		const highlight_group = document.createElement("p");
		highlight_moment.appendChild(highlight_group);
		highlight_group.textContent = "  -  "+ analysis_results[index].group;
		highlight_group.className = "highlight_group_text";
		highlights_menu.appendChild(highlight_moment);
	}
	
}

//Reset done on saving new settings
function reset_gathering_analysis_variables(){
	current_gathering_state = 0;
	current_analysis_state = 0;
	next_continuation_id = "";
	latest_gathering_message_time = null;
	analysis_results = [];
	initial_analysis_variables = [-1, 0, 20, 1];
	message_array = [];
	group_analysis_variables = [];
	enabled_settings_groups = [];
	
	for(i in settings_groups){
		if(settings_groups[i]["Enabled"]){
			group_analysis_variables.push({
										"filter_match_count": 0, 
										"text_match_count": 0, 
										"trend_start_time": null
									});
			enabled_settings_groups.push(settings_groups[i]);
		}
	}
	
	console.error(group_analysis_variables);
	console.error(enabled_settings_groups);
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
	if(current_analysis_state === 0){
		current_analysis_state = 1;
		analyze_messages(initial_analysis_variables[0], initial_analysis_variables[1], initial_analysis_variables[2], initial_analysis_variables[3]);
	}
	

	if(continuation_id !== "DONE!"){
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
				
				
				if(chat_info.continuations[0].liveChatReplayContinuationData)
					next_continuation_id = chat_info.continuations[0].liveChatReplayContinuationData.continuation;

				
				for(const chat_item in chat_info.actions) {
					if(chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction !== undefined && chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction.item.liveChatTextMessageRenderer !== undefined)
						message_array.push(chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction.item.liveChatTextMessageRenderer);
				}
				
				console.log(message_array);
				latest_gathering_message_time = timestamp_to_seconds(message_array[message_array.length - 1].timestampText.simpleText);
				update_main_menu();
				
				try{
					console.log("[" + iteration_count + "] Continuation ID: " + chat_info.continuations[0].liveChatReplayContinuationData.continuation)
				} catch(error) {
					console.log("Reached end of continuations")
					next_continuation_id = "DONE!";
					current_gathering_state = 2;
					return;
				}
				
				if(data)
					return get_next_continuation(next_continuation_id, iteration_count + 1);
			}
		);
	}

}

function analyze_messages(current_analysis_time, current_righthand_index, analysis_time_width, iteration_count) {
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
			initial_analysis_variables = ["DONE!", current_righthand_index, analysis_time_width, iteration_count, group_analysis_variables];
			chrome.storage.local.set({"livestream_highlighter_progress": [root_url, analysis_results, next_continuation_id, message_array, video_length, initial_analysis_variables]});
			update_main_menu();
			console.log(analysis_results);
			return;
		}
		
		//Saves progress to variables
		initial_analysis_variables = [current_analysis_time, current_righthand_index, analysis_time_width, iteration_count, group_analysis_variables]
		
		console.log("message_array length check: " + message_array.length);
		
		console.log("current_gathering_state: " + current_gathering_state)
		console.log("latest gathering time : current + width + 1  =  " + latest_gathering_message_time + " : " + (current_analysis_time + analysis_time_width + 1));
		
		if(current_gathering_state === 2 || latest_gathering_message_time > current_analysis_time + analysis_time_width + 1){
			current_time = Date.now();
			console.log("Checkpoint 2: " + current_time);
			if(current_time > last_checkpoint_time)
				analysis_time_changes[1]+= current_time - last_checkpoint_time;
			last_checkpoint_time = current_time;
			
			if(current_analysis_time % 100 === 0)
				console.log("Analysis time: " + current_analysis_time + " " + message_array.length + " " + current_righthand_index);
			
			
			
			current_analysis_time++;
			console.log("Incrementing analysis time: " + current_analysis_time);
			
			
			
			try {
				if(current_gathering_state !== 2 || current_righthand_index !== message_array.length)
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
			try{
				while(current_righthand_index !== message_array.length && timestamp_to_seconds(message_array[current_righthand_index].timestampText.simpleText) <= current_analysis_time + analysis_time_width){
					console.log("Index heading right! Currently at " + current_righthand_index);
					
					for(let i = 0; i < enabled_settings_groups.length; i++){
						let passes_regex_filter = false;
						
						//Looks through message parts to check to see if the message matches the current group's filter
						for(let part_of_message = 0; part_of_message < message_array[current_righthand_index].message.runs.length; part_of_message++){
							let message_part = "";
							if(message_array[current_righthand_index].message.runs[part_of_message].text)
								message_part = message_array[current_righthand_index].message.runs[part_of_message].text;
							else if(message_array[current_righthand_index].message.runs[part_of_message].emoji)
								message_part = message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts[message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts.length - 1];
							else
								continue;
							
							if(!message_part)
								console.log(message_array[current_righthand_index])
							if(enabled_settings_groups[i]["Regex filter"].test(message_part)){
								group_analysis_variables[i].filter_match_count += 1;
								passes_regex_filter = true;
								//console.log("Passed Regex filter: " + enabled_settings_groups[i]["Regex filter"].source);
								//console.log(message_array[current_righthand_index]);
								break;
							}
						}
						
						//Looks through message parts for trend indicator text match
						if(passes_regex_filter){
							let match_found = false;
							for(let j = 0; j < enabled_settings_groups[i]["Text to match"].length; j++){
								
								for(let part_of_message = 0; part_of_message < message_array[current_righthand_index].message.runs.length; part_of_message++){
									let message_part = "";
									if(message_array[current_righthand_index].message.runs[part_of_message].text)
										message_part = message_array[current_righthand_index].message.runs[part_of_message].text;
									else if(message_array[current_righthand_index].message.runs[part_of_message].emoji)
										message_part = message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts[message_array[current_righthand_index].message.runs[part_of_message].emoji.shortcuts.length - 1];
									else
										continue;
									
									//console.log("Current message part: " + message_part)
									
									if(!message_part)
										console.log(message_array[current_righthand_index])
									if(enabled_settings_groups[i]["Text to match"][j]["String/Regex"] === "Regex"){
										if(enabled_settings_groups[i]["Text to match"][j].Text.test(message_part)){
											group_analysis_variables[i].text_match_count += 1;
											match_found = true;
											break;
										}
									}
									else if(message_part.includes(enabled_settings_groups[i]["Text to match"][j].Text)){
										//console.log(message_array[current_righthand_index].timestampText.simpleText + " - " + enabled_settings_groups[i]["Text to match"][j].Text)
										group_analysis_variables[i].text_match_count += 1;
										match_found = true;
										break;
									}
								}
								if(match_found)
									break;
							}
						}
					}
					current_righthand_index++;
				}
			} catch (error) {
				console.log(error);
				console.log(enabled_settings_groups);
				return;
			}
			
			console.log("DEBUGGING AFTER RIGHTSIDE: current_righthand_index: " + current_righthand_index);
			console.log("Current gathering state: " + current_gathering_state);
			console.log("Latest gathered message time: " + latest_gathering_message_time);
			console.log(message_array[current_righthand_index - 1]);
			console.log(message_array[current_righthand_index]);
			
			
			
			try{
				if(current_gathering_state !== 2 || current_righthand_index !== message_array.length)
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
				for(let i = 0; i < enabled_settings_groups.length; i++){
					let passes_regex_filter = false;
					
					//Looks through message parts to check to see if the message matches the current group's filter
					for(let part_of_message = 0; part_of_message < message_array[0].message.runs.length; part_of_message++){
						let message_part = "";
						if(message_array[0].message.runs[part_of_message].text)
							message_part = message_array[0].message.runs[part_of_message].text;
						else if(message_array[0].message.runs[part_of_message].emoji)
							message_part = message_array[0].message.runs[part_of_message].emoji.shortcuts[message_array[0].message.runs[part_of_message].emoji.shortcuts.length - 1];
						else
							continue;
						
						if(!message_part)
							console.log(message_array[0])
						if(enabled_settings_groups[i]["Regex filter"].test(message_part)){
							group_analysis_variables[i].filter_match_count -= 1;
							passes_regex_filter = true;
							//console.log("Passed Regex filter: " + enabled_settings_groups[i]["Regex filter"].source);
							//console.log(message_array[0]);
							break;
						}
					}
					
					if(passes_regex_filter){
						let match_found = false; //For getting out of the double for loop when a match is found
						for(let j = 0; j < enabled_settings_groups[i]["Text to match"].length; j++){
							for(let part_of_message = 0; part_of_message < message_array[0].message.runs.length; part_of_message++){
								let message_part = "";
								if(message_array[0].message.runs[part_of_message].text)
									message_part = message_array[0].message.runs[part_of_message].text;
								else if(message_array[0].message.runs[part_of_message].emoji)
									message_part = message_array[0].message.runs[part_of_message].emoji.shortcuts[message_array[0].message.runs[part_of_message].emoji.shortcuts.length - 1];
								else
									continue;
								
								//console.log("Current message part: " + message_part)
								
								if(!message_part)
									console.log(message_array[0])
								if(enabled_settings_groups[i]["Text to match"][j]["String/Regex"] === "Regex"){
									if(enabled_settings_groups[i]["Text to match"][j].Text.test(message_part)){
										group_analysis_variables[i].text_match_count -= 1;
										match_found = true;
										break;
									}
								}
								else if(message_part.includes(enabled_settings_groups[i]["Text to match"][j].Text)){
									//console.log(message_array[0].timestampText.simpleText + " - " + enabled_settings_groups[i]["Text to match"][j].Text)
									group_analysis_variables[i].text_match_count -= 1;
									match_found = true;
									break;
								}
							}
							if(match_found)
								break;
						}
					}
				}
				console.log(message_array);
				console.log(message_array[0]);
				console.log("current_righthand_index: " + current_righthand_index);
				console.log("current_analysis_time: " + current_analysis_time)
				console.log(message_array.shift());
				current_righthand_index--;
				console.log(message_array);
				console.log(message_array[0]);
				console.log("current_righthand_index: " + current_righthand_index);
				console.log("current_analysis_time: " + current_analysis_time)
			}
			
			
			
			//Trend finding logic
			for(let group_index = 0; group_index < group_analysis_variables.length; group_index++){
				console.log("Trend logic: Group [" + group_index + "] - " + group_analysis_variables[group_index].text_match_count + " : " + group_analysis_variables[group_index].filter_match_count);
				if(group_analysis_variables[group_index].text_match_count/group_analysis_variables[group_index].filter_match_count >= enabled_settings_groups[group_index]["Sensitivity"]){
					console.log("Trend detected at " + current_analysis_time + " - " + group_analysis_variables[group_index].text_match_count/group_analysis_variables[group_index].filter_match_count + " - " + enabled_settings_groups[group_index]["Name"]);
					if(group_analysis_variables[group_index].trend_start_time === null)
						group_analysis_variables[group_index].trend_start_time = current_analysis_time;
				} else {
					if(group_analysis_variables[group_index].trend_start_time !== null){
						analysis_results.push({"group": enabled_settings_groups[group_index]["Name"], "start_time": group_analysis_variables[group_index].trend_start_time, "end_time": current_analysis_time});
						group_analysis_variables[group_index].trend_start_time = null;
					}
				}
			}
			
			current_time = Date.now();
			console.log("Checkpoint 3: " + current_time);
			if(current_time > last_checkpoint_time)
				analysis_time_changes[2]+= current_time - last_checkpoint_time;
			last_checkpoint_time = current_time;
		}
		else 	//Breaks loop when analysis has caught up to gathering and needs more messages to arrive first
			break;
		
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
	
	setTimeout(analyze_messages, 0, current_analysis_time, current_righthand_index, analysis_time_width, iteration_count + 1, group_analysis_variables);
	
	current_time = Date.now();
	console.log("Checkpoint 6: " + current_time);
	if(current_time > last_checkpoint_time)
		analysis_time_changes[5]+= current_time - last_checkpoint_time;
	last_checkpoint_time = current_time;
}



async function highlights_button_pressed() {
	console.log("Highlights button pressed");
	if(menu_is_open){
		clearInterval(progress_save_interval);
		
		if(settings_menu_is_open)
			highlights_area.removeChild(settings_menu);
		highlights_area.removeChild(highlights_menu);
		menu_is_open = false;
	} else {
		progress_save_interval = setInterval(() => {
			if(!(current_gathering_state === 2 && current_analysis_state === 2) && analysis_results.length < 1000 && message_array.length < 2000){
				chrome.storage.local.set({"livestream_highlighter_progress": [root_url, analysis_results, next_continuation_id, message_array, video_length, initial_analysis_variables]});
			}
		}, 1000);
		
		if(settings_menu_is_open)
			highlights_area.appendChild(settings_menu);
		highlights_area.appendChild(highlights_menu);
		menu_is_open = true;
		
		
	}
	
	
	if(current_gathering_state === 0 || current_analysis_state === 0){
		current_gathering_state = 1;
		update_main_menu();
		
		if(!next_continuation_id)
			next_continuation_id = await get_initial_continuation_ID();
		await get_next_continuation(next_continuation_id, 0);
		
		update_main_menu();
	} else {
		update_main_menu();
		console.log("Route 2")
	}
}




//Initial insertion of elements into DOM and retrieval of video length from DOM
if(!document.getElementById("highlights_area") && !document.getElementsByClassName("ytp-ad-module")[0].children.length && document.getElementById("chat") && document.getElementById("comments")){
	console.log("Livestream Highlighter: Inserting Highlights Area");
	recommended_section = document.getElementById("related");
	document.getElementById("related").parentNode.insertBefore(highlights_area, recommended_section)
	video_length = timestamp_to_seconds(document.getElementsByClassName("ytp-time-duration")[0].textContent);
	console.log("video_length: " + video_length);
}

//Sometimes, DOM insertion fails because the page loads too slowly. The follow code block
//prevents this by checking for failure twice a second for 30 seconds. It also deals with
//ad length being confused for video length.
let retry_count = 0;
let ad_playing = false;
var retry_interval = setInterval(() => {
	if(document.getElementsByClassName("ytp-ad-module")[0].children.length){
		ad_playing = true;
		video_length = null;
	} else {
		if(!ad_playing){
			if(!document.getElementById("highlights_area") && document.getElementById("chat") && document.getElementById("comments") && !document.getElementsByClassName("ytp-ad-module")[0].children.length){
				console.log("Livestream Highlighter: Inserting Highlights Area");
				recommended_section = document.getElementById("related");
				document.getElementById("related").parentNode.insertBefore(highlights_area, recommended_section)
				video_length = timestamp_to_seconds(document.getElementsByClassName("ytp-time-duration")[0].textContent);
				console.log("Livestream Highlighter: video_length: " + video_length);
			}
			retry_count++;
			if(retry_count >= 60)
				window.clearInterval(retry_interval);
		}
		ad_playing = false;
	}
}, 500);


