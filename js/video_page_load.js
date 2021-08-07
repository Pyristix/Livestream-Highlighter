console.log("Livestream Highlighter: Content script loaded")

//0=Initial, 1=Gathering messages, 2=Analyzing messages, 3=Displaying analysis results
let current_processing_state = 0;

let menu_is_open = false;
let settings_menu_is_open = false;
let video_length = null;
let recommended_section = null;

//Settings Variables


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
save_settings_button.textContent = "SAVE SETTINGS";
save_settings_button.addEventListener("click", () => {
	settings_menu_is_open = false;
	highlights_area.removeChild(settings_menu);
	update_main_menu();
})

function timestamp_to_seconds(timestamp) {
	timestamp = timestamp.split(":");
	if(timestamp.length === 2)
		return parseInt(timestamp[0])*60 + parseInt(timestamp[1]);
	if(timestamp.length === 3)
		return parseInt(timestamp[0])*60*60 + parseInt(timestamp[1])*60 + parseInt(timestamp[2]);
}

//Updates what's shown on the main menu according to the current processing state
function update_main_menu(latest_message_time) {
	if(current_processing_state === 1)
		highlights_menu_status_message.textContent = (video_length && latest_message_time) ? "Gathering chat messages: " + ((latest_message_time/video_length)*100).toPrecision(3) + "%" : "Gathering chat messages";
	else if(current_processing_state === 2)
		highlights_menu_status_message.textContent = "Analyzing live chat...";
	else
		highlights_menu_status_message.textContent = "";
	
	highlights_menu.innerHTML = "";
	if(!settings_menu_is_open)
		highlights_menu.appendChild(settings_button);
	highlights_menu.appendChild(highlights_menu_status_message);
}

//Gets the first continuation id from the webpage
function get_initial_continuation_ID(message_array) {
	return fetch(window.location.href)
	.then(
		(response) => {
			if(response.status !== 200) {
				console.log("Livestream Highlighter: Error on retrieving initial continuation ID. Error code: " + response.status)
				return;
			}
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
function get_next_continuation(continuation_id, message_array, iteration_count) {
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
				try{
					message_array.push(chat_info.actions[chat_item].replayChatItemAction.actions[0].addChatItemAction.item.liveChatTextMessageRenderer);
				} catch (err) {
					console.log(err);
					continue;
				}
			}
			
			console.log(message_array);
			const latest_message_time = timestamp_to_seconds(message_array[message_array.length - 1].timestampText.simpleText);
			update_main_menu(latest_message_time);
			
			try{
				console.log("[" + iteration_count + "] Continuation ID: " + chat_info.continuations[0].liveChatReplayContinuationData.continuation)
			} catch(error) {
				console.log("Reached end of continuations")
				return;
			}
			
			if(data)
				return get_next_continuation(chat_info.continuations[0].liveChatReplayContinuationData.continuation, message_array, iteration_count + 1);
		}
	);
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
	
	if(current_processing_state === 0){
		current_processing_state = 1;
		update_main_menu();
		let message_array = [];
		const initial_continuation_id = await get_initial_continuation_ID(message_array);
		console.log("initial_continuation_id: " + initial_continuation_id);
		await get_next_continuation(initial_continuation_id, message_array, 0);
		console.log(message_array);
		current_processing_state = 2;
		update_main_menu();
	} else {
		console.log("Route 2")
	}
}

try{
	video_length = timestamp_to_seconds(document.getElementsByClassName("ytp-time-duration")[0].textContent);
} catch (error) {
	console.log(error);
}

try{
	recommended_section = document.getElementById("related");
	document.getElementById("related").parentNode.insertBefore(highlights_area, recommended_section);
} catch(error) {
	console.log(error);
}




