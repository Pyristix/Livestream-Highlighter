console.log("Extension script working")

function highlights_button_pressed() {
	console.log("Highlights button pressed");
}

var highlights_button = document.createElement("button");
highlights_button.id = "highlights_button";
highlights_button.textContent = "LIVESTREAM HIGHLIGHTS";
highlights_button.addEventListener("click", highlights_button_pressed);

window.onload = function() {
	const chatframe = document.getElementById("chatframe")
	chatframe.parentNode.appendChild(highlights_button);
}




