console.log("Livestream Highlighter: Content script loaded")

//Settings Variables


function get_initial_continuation_ID() {
	fetch(window.location.href)
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
			continuationIndex = data.indexOf('"continuation":"') + 16;
			return data.substring(continuationIndex, data.indexOf('"', continuationIndex));
		}
	);
}

function get_next_continuation() {
	//TODO: "https://www.youtube.com/live_chat_replay?continuation="
}

function highlights_button_pressed() {
	console.log("Highlights button pressed");
	get_initial_continuation_ID();
}

var highlights_button = document.createElement("button");
highlights_button.id = "highlights_button";
highlights_button.textContent = "LIVESTREAM HIGHLIGHTS";
highlights_button.addEventListener("click", highlights_button_pressed);

window.onload = function() {
	const chatframe = document.getElementById("chatframe")
	chatframe.parentNode.appendChild(highlights_button);
}




