# Web-Based IP Address Scheme Calculator

This is a simple, client-side web application for calculating IP addressing schemes. It allows you to input a network IP and subnet mask, and optionally request calculations based on a desired number of subnets or a desired number of devices per subnet.

## Features

*   Calculates Network ID, Broadcast ID, Subnet Mask, Usable Host Range, and Number of Usable Hosts for a given IP and mask.
*   Subdivide a network based on a desired number of subnets.
*   Calculate the required subnet size based on a desired number of devices per subnet, and list resulting subnets.
*   Input validation and clear error messages.
*   Client-side calculations (no server-side processing needed).

## How to Use

1.  Clone or download the repository.
2.  Open the `index.html` file in any modern web browser.
3.  Fill in the input fields:
    *   **IP Address:** Enter a valid IPv4 address (e.g., `192.168.1.0`). This can be any IP within the network; the tool will determine the network ID.
    *   **Subnet Mask:** Enter the subnet mask for the IP address. This can be in dotted decimal format (e.g., `255.255.255.0`) or CIDR prefix format (e.g., `/24`).
    *   **Number of Desired Subnets (Optional):** If you want to divide the above network into a specific number of smaller subnets, enter the count here.
    *   **Number of Desired Devices per Subnet (Optional):** If you want to create subnets that can each support a specific number of devices, enter that count here. *Note: Do not fill both "Number of Subnets" and "Number of Devices" at the same time.*
4.  Click the "Calculate" button.
5.  The results will be displayed below the form.

## Technologies Used

*   HTML
*   CSS
*   JavaScript (ES6+)

## Files

*   `index.html`: The main HTML file containing the structure of the calculator.
*   `style.css`: Contains the CSS rules for styling the application.
*   `script.js`: Contains all the JavaScript logic for IP calculations and interactivity.
