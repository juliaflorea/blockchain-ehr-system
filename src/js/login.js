connect();
async function login() {
  $(".alert-warning").hide();

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });

    if (accounts.length === 0) {
      console.error("No accounts found");
      alert("No accounts found. Please make sure you are logged in to your Ethereum wallet.");
      return;
    }

    const publicKey = accounts[0].toLowerCase();
    console.log(publicKey);

    const isPatient = await isUserInList(publicKey, "get_patient_list");
    const isDoctor = await isUserInList(publicKey, "get_doctor_list");
    const isProxy = await isUserInList(publicKey, "get_proxy_list");

    if (isPatient) {
      location.href = `./patient.html?key=${publicKey}`;
    } else if (isDoctor) {
      location.href = `./doctor.html?key=${publicKey}`;
    } else if (isProxy) {
      location.href = `./proxy.html?key=${publicKey}`; // Redirect proxy users to the proxy dashboard
    } else {
      console.log("Invalid User!");
      alert("Invalid user. Please make sure you are registered and logged in with the correct account.");
    }
  } catch (error) {
    console.error("Error during login:", error);
    alert("Error during login. Please try again later.");

  }
}

async function isUserInList(publicKey, listMethod) {
  try {
    const result = await contractInstance.methods[listMethod]().call();
    const userList = result.map((user) => user.toLowerCase());
    return userList.includes(publicKey);
  } catch (error) {
    console.error(`Error checking user in ${listMethod}:`, error);
    return false;
  }
}

$(document).ready(function() {
  
  $(window).scroll(function() {
    var scroll = $(window).scrollTop();
    if (scroll >= 50) {
      $("#mainNav").addClass("scroll-down");
    } else {
      $("#mainNav").removeClass("scroll-down");
    }
  });

  $("#signupButton").kendoButton({
    click: function() {
      // Redirect to the register.html page
      window.location.href = 'register.html';
    }
  });

  // Define an array to hold the data for the steps
var steps = [
  {
    title: "Register Yourself",
    description: "Join our community by registering as a patient, doctor or proxy.",
    iconClass: "fas fa-user-plus"
  },
  {
    title: "Log In",
    description: "Access your account using your secure credentials via Metamask.",
    iconClass: "fas fa-check-circle"
  },
  {
    title: "Manage Your Data",
    description: "Effortlessly create, access or sahre your medical records securely.",
    iconClass: "fas fa-upload"
  }
];

// Iterate over the steps array to create the Kendo UI cards
$.each(steps, function (index, step) {
  // Create a new card element
  var card = $('<div class="col-md-4">').append(
    $('<div class="k-card">').append(
      $('<div class="k-card-body text-center">').append(
        $('<span>').addClass(step.iconClass + " fa-3x"),
        $('<h4>').text(step.title),
        $('<p>').text(step.description)
      )
    )
  );
  
  // Append the card to the container
  $("#steps-cards").append(card);
});

// Enable Kendo UI styling on the dynamically added elements
kendo.init($("#get-started"));

$("a.nav-link").on('click', function(event) {
  if (this.hash !== "") {
    // Prevent default anchor click behavior
    event.preventDefault();

    // Store hash
    var hash = this.hash;

    // Using jQuery's animate() method to add smooth page scroll
    // The optional number (800) specifies the number of milliseconds it takes to scroll to the specified area
    $('html, body').animate({
      scrollTop: $(hash).offset().top
    }, 800, function(){
      // Add hash (#) to URL when done scrolling (default click behavior)
      window.location.hash = hash;
    });
  } // End if
});





});
