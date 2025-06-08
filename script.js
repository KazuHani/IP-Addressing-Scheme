document.addEventListener('DOMContentLoaded', () => {
    const ipAddressInput = document.getElementById('ipAddress');
    const subnetMaskInput = document.getElementById('subnetMask');
    const numSubnetsInput = document.getElementById('numSubnets');
    const numDevicesInput = document.getElementById('numDevices');
    const calculateButton = document.getElementById('calculateButton');
    const resultsDiv = document.getElementById('results');

    // --- IP Conversion & Validation Utilities ---
    function ipToInt(ipString) {
        if (typeof ipString !== 'string') return null;
        const octets = ipString.split('.');
        if (octets.length !== 4) return null;
        let intVal = 0;
        for (let i = 0; i < 4; i++) {
            const octet = parseInt(octets[i], 10);
            if (isNaN(octet) || octet < 0 || octet > 255) return null;
            intVal = (intVal << 8) | octet;
        }
        return intVal >>> 0;
    }

    function intToIp(ipInt) {
        if (typeof ipInt !== 'number' || ipInt < 0 || ipInt > 0xFFFFFFFF) return null;
        return `${(ipInt >>> 24)}.${(ipInt >> 16) & 0xFF}.${(ipInt >> 8) & 0xFF}.${ipInt & 0xFF}`;
    }

    function isValidIP(ipString) {
        return ipToInt(ipString) !== null;
    }

    function getPrefixLength(maskInt) {
        if (maskInt === null || maskInt < 0 || maskInt > 0xFFFFFFFF) return -1;
        let prefix = 0;
        for (let i = 31; i >= 0; i--) {
            if (!((maskInt >>> i) & 1)) break; // Find first 0 from MSB
            prefix = 32 - i;
        }
        // Verify that all bits after the prefix are 0
        const checkMask = prefix === 0 ? 0 : (~(0xFFFFFFFF >>> prefix)) >>> 0;
        return (maskInt === checkMask) ? prefix : -1;
    }

    function parseMask(maskString) {
        if (typeof maskString !== 'string') return null;
        if (maskString.startsWith('/')) {
            const cidr = parseInt(maskString.substring(1), 10);
            if (isNaN(cidr) || cidr < 0 || cidr > 32) return null;
            if (cidr === 0) return 0;
            return cidr === 32 ? 0xFFFFFFFF : (~(0xFFFFFFFF >>> cidr)) >>> 0;
        }
        const maskInt = ipToInt(maskString);
        if (maskInt === null) return null;
        if (getPrefixLength(maskInt) === -1) return null;
        return maskInt;
    }

    // --- Core Calculation Logic ---
    function calculateNetworkDetails(ipString, originalMaskString, desiredNumSubnets, desiredNumDevices) {
        if (!isValidIP(ipString)) return { error: "Invalid IP address format." };

        const originalMaskInt = parseMask(originalMaskString);
        if (originalMaskInt === null) return { error: "Invalid original subnet mask. Must be CIDR or valid dotted decimal with contiguous 1s." };

        const ipInt = ipToInt(ipString);
        const originalNetworkIdInt = (ipInt & originalMaskInt) >>> 0;
        const originalPrefix = getPrefixLength(originalMaskInt);
        if (originalPrefix === -1) return { error: "Invalid original subnet mask value (non-contiguous)." };

        // Mode 1: Subnet by desired number of subnets
        if (desiredNumSubnets && Number.isInteger(desiredNumSubnets) && desiredNumSubnets > 0) {
            const subnetBitsNeeded = Math.ceil(Math.log2(desiredNumSubnets));
            const newPrefix = originalPrefix + subnetBitsNeeded;

            if (newPrefix > 30 && desiredNumSubnets > 1) return { error: `Too many subnets requested. New prefix /${newPrefix} is too large for multiple usable subnets. Max prefix for this is /30.` };
            if (newPrefix > 32) return { error: `New prefix /${newPrefix} exceeds /32.` };

            const newMaskInt = newPrefix === 0 ? 0 : (newPrefix === 32 ? 0xFFFFFFFF : (~(0xFFFFFFFF >>> newPrefix)) >>> 0);
            const subnetsArray = [];
            const newSubnetSize = newPrefix === 32 ? 1 : Math.pow(2, 32 - newPrefix);
            const maxPossibleSubnets = originalMaskInt === 0 ? Math.pow(2, subnetBitsNeeded) : Math.pow(2, newPrefix - originalPrefix);
            const numToGenerate = Math.min(desiredNumSubnets, maxPossibleSubnets);

            for (let i = 0; i < numToGenerate; i++) {
                const currentSubnetIdInt = (originalNetworkIdInt + (i * newSubnetSize)) >>> 0;
                if (i > 0 && currentSubnetIdInt <= subnetsArray[subnetsArray.length - 1].networkAddressInt) break;
                if ((currentSubnetIdInt & originalMaskInt) !== originalNetworkIdInt && originalMaskInt !== 0) break;
                const originalBroadcast = (originalNetworkIdInt | ((~originalMaskInt) >>> 0)) >>> 0;
                if (currentSubnetIdInt > originalBroadcast && originalMaskInt !== 0) break;

                const broadcastIdInt = (currentSubnetIdInt | ((~newMaskInt) >>> 0)) >>> 0;
                let numHosts = 0;
                if (newPrefix <= 30) numHosts = newSubnetSize - 2;
                if (numHosts < 0) numHosts = 0;

                subnetsArray.push({
                    networkAddressInt: currentSubnetIdInt,
                    networkAddress: intToIp(currentSubnetIdInt),
                    subnetMaskString: intToIp(newMaskInt),
                    subnetPrefixLength: newPrefix,
                    broadcastAddress: intToIp(broadcastIdInt),
                    firstUsableIP: numHosts > 0 ? intToIp(currentSubnetIdInt + 1) : 'N/A',
                    lastUsableIP: numHosts > 0 ? intToIp(broadcastIdInt - 1) : 'N/A',
                    numUsableHosts: numHosts
                });
            }
            if (subnetsArray.length === 0 && desiredNumSubnets > 0) return { error: `Could not generate any subnets. Original network /${originalPrefix} may be too small for ${desiredNumSubnets} subnets of /${newPrefix}.` };

            return {
                calculationMode: 'bySubnets',
                userInputIP: ipString,
                originalMaskString: intToIp(originalMaskInt),
                originalPrefix: originalPrefix,
                newSubnetMaskString: intToIp(newMaskInt),
                newSubnetPrefix: newPrefix,
                requestedSubnets: desiredNumSubnets,
                subnets: subnetsArray,
                error: null
            };
        }
        // Mode 2: Subnet by desired devices per subnet
        else if (desiredNumDevices && Number.isInteger(desiredNumDevices) && desiredNumDevices > 0) {
            const hostBitsNeeded = Math.ceil(Math.log2(desiredNumDevices + 2));
            const newPrefix = 32 - hostBitsNeeded;

            if (newPrefix < originalPrefix && originalPrefix !== 0) return { error: `Requested ${desiredNumDevices} devices require a /${newPrefix} subnet, larger than original /${originalPrefix} network.` };
            if (newPrefix > 30 && desiredNumDevices > 1 ) return { error: `Cannot create subnets for ${desiredNumDevices} devices with prefix /${newPrefix}. Smallest practical prefix for multiple devices is /30.` };
            if (newPrefix > 32 || hostBitsNeeded < 2) return { error: `Invalid device count leading to impossible prefix /${newPrefix}. Each subnet requires at least 2 host bits for usable IPs.` };


            const newMaskInt = newPrefix === 0 ? 0 : (newPrefix === 32 ? 0xFFFFFFFF : (~(0xFFFFFFFF >>> newPrefix)) >>> 0);
            const hostsSupported = Math.pow(2, hostBitsNeeded) - 2;
            const subnetsArray = [];
            const newSubnetSize = Math.pow(2, 32 - newPrefix);
            const originalNetworkSize = (originalMaskInt === 0) ? Math.pow(2,32) : Math.pow(2, 32 - originalPrefix);
            const numPossibleSubnets = Math.floor(originalNetworkSize / newSubnetSize);

            for (let i = 0; i < numPossibleSubnets; i++) {
                const currentSubnetIdInt = (originalNetworkIdInt + (i * newSubnetSize)) >>> 0;
                if (i > 0 && currentSubnetIdInt <= subnetsArray[subnetsArray.length - 1].networkAddressInt) break;
                if ((currentSubnetIdInt & originalMaskInt) !== originalNetworkIdInt && originalMaskInt !== 0) break;
                const originalBroadcast = (originalNetworkIdInt | ((~originalMaskInt) >>> 0)) >>> 0;
                if (currentSubnetIdInt > originalBroadcast && originalMaskInt !== 0) break;

                const broadcastIdInt = (currentSubnetIdInt | ((~newMaskInt) >>> 0)) >>> 0;
                let numHosts = (newPrefix <= 30) ? newSubnetSize - 2 : 0;
                if (numHosts < 0) numHosts = 0;

                subnetsArray.push({
                    networkAddressInt: currentSubnetIdInt,
                    networkAddress: intToIp(currentSubnetIdInt),
                    subnetMaskString: intToIp(newMaskInt),
                    subnetPrefixLength: newPrefix,
                    broadcastAddress: intToIp(broadcastIdInt),
                    firstUsableIP: numHosts > 0 ? intToIp(currentSubnetIdInt + 1) : 'N/A',
                    lastUsableIP: numHosts > 0 ? intToIp(broadcastIdInt - 1) : 'N/A',
                    numUsableHosts: numHosts
                });
            }
            if (subnetsArray.length === 0 && desiredNumDevices > 0) return { error: `Could not generate any subnets for ${desiredNumDevices} devices. Original network /${originalPrefix} may be too small.` };

            return {
                calculationMode: 'byDevices',
                userInputIP: ipString,
                originalMaskString: intToIp(originalMaskInt),
                originalPrefix: originalPrefix,
                newSubnetMaskString: intToIp(newMaskInt),
                newSubnetPrefix: newPrefix,
                requestedDevices: desiredNumDevices,
                hostsSupportedByNewMask: hostsSupported < 0 ? 0 : hostsSupported,
                subnets: subnetsArray,
                error: null
            };
        }

        // Mode 3: Single Network Details
        const broadcastIdInt = (originalNetworkIdInt | ((~originalMaskInt) >>> 0)) >>> 0;
        let numHosts = 0;
        if (originalPrefix <= 30) numHosts = Math.pow(2, 32 - originalPrefix) - 2;
        if (numHosts < 0) numHosts = 0;

        return {
            calculationMode: 'singleNetwork',
            userInputIP: ipString,
            originalMaskString: intToIp(originalMaskInt),
            originalPrefix: originalPrefix,
            networkAddress: intToIp(originalNetworkIdInt),
            broadcastAddress: intToIp(broadcastIdInt),
            firstUsableIP: numHosts > 0 ? intToIp(originalNetworkIdInt + 1) : 'N/A',
            lastUsableIP: numHosts > 0 ? intToIp(broadcastIdInt - 1) : 'N/A',
            numUsableHosts: numHosts,
            error: null
        };
    }

    // --- Display Logic ---
    function displayResults(details) {
        resultsDiv.innerHTML = '';

        if (details.error) {
            const errorP = document.createElement('p');
            errorP.className = 'error-message';
            errorP.textContent = details.error;
            resultsDiv.appendChild(errorP);
            return;
        }

        // Section 1: User Input & Original Network
        const inputSummaryDiv = document.createElement('div');
        inputSummaryDiv.className = 'results-section';
        let inputHtml = `<h3>Original Network Parameters</h3>
                         <p>IP Address Provided: <strong>${details.userInputIP}</strong></p>
                         <p>Original Subnet Mask: <strong>${details.originalMaskString} /${details.originalPrefix}</strong></p>`;
        if (details.calculationMode !== 'singleNetwork') {
             inputHtml += `<p>Original Network ID: <strong>${intToIp((ipToInt(details.userInputIP) & ipToInt(details.originalMaskString)) >>> 0)}</strong></p>`;
        }
        inputSummaryDiv.innerHTML = inputHtml;
        resultsDiv.appendChild(inputSummaryDiv);


        // Section 2: Subnetting Parameters (if applicable)
        if (details.calculationMode === 'bySubnets' || details.calculationMode === 'byDevices') {
            const subnetParamsDiv = document.createElement('div');
            subnetParamsDiv.className = 'results-section';
            let paramsHtml = `<h3>Subnetting Parameters</h3>`;
            if (details.calculationMode === 'bySubnets') {
                paramsHtml += `<p>Subnetting based on: <strong>${details.requestedSubnets} desired subnets</strong></p>`;
            } else { // byDevices
                paramsHtml += `<p>Subnetting based on: <strong>${details.requestedDevices} desired devices per subnet</strong></p>`;
                paramsHtml += `<p>Usable hosts provided by new mask: <strong>${details.hostsSupportedByNewMask}</strong></p>`;
            }
            paramsHtml += `<p>New Subnet Mask for calculated subnets: <strong>${details.newSubnetMaskString} /${details.newSubnetPrefix}</strong></p>`;
            if (details.subnets && details.subnets.length > 0) {
                 paramsHtml += `<p>Number of Subnets Generated: <strong>${details.subnets.length}</strong></p>`;
            }
            subnetParamsDiv.innerHTML = paramsHtml;
            resultsDiv.appendChild(subnetParamsDiv);
        }

        // Section 3: Detailed Results (Single Network or List of Subnets)
        const detailedResultsDiv = document.createElement('div');
        detailedResultsDiv.className = 'results-section';

        if (details.calculationMode === 'singleNetwork') {
            detailedResultsDiv.innerHTML = `<h3>Network Details</h3>`;
            const list = document.createElement('ul');
            appendListItem(list, "Network Address", details.networkAddress);
            appendListItem(list, "Subnet Mask", `${details.originalMaskString} /${details.originalPrefix}`);
            appendListItem(list, "Usable Host Range", `${details.firstUsableIP} - ${details.lastUsableIP}`);
            appendListItem(list, "Broadcast Address", details.broadcastAddress);
            appendListItem(list, "Number of Usable Hosts", details.numUsableHosts);
            detailedResultsDiv.appendChild(list);
        } else if (details.subnets && details.subnets.length > 0) {
            detailedResultsDiv.innerHTML = `<h3>Generated Subnets</h3>`;
            details.subnets.forEach((subnet, index) => {
                const subnetDiv = document.createElement('div');
                subnetDiv.className = 'subnet-item';

                const heading = document.createElement('h4');
                heading.textContent = `Subnet ${index + 1}`;
                subnetDiv.appendChild(heading);

                const list = document.createElement('ul');
                appendListItem(list, "Network Address", subnet.networkAddress);
                appendListItem(list, "Subnet Mask", `${subnet.subnetMaskString} /${subnet.subnetPrefixLength}`);
                appendListItem(list, "Usable Host Range", `${subnet.firstUsableIP} - ${subnet.lastUsableIP}`);
                appendListItem(list, "Broadcast Address", subnet.broadcastAddress);
                appendListItem(list, "Number of Usable Hosts", subnet.numUsableHosts);
                subnetDiv.appendChild(list);
                detailedResultsDiv.appendChild(subnetDiv);
            });
        } else if (details.calculationMode !== 'singleNetwork') { // Subnetting was attempted but no subnets generated
            detailedResultsDiv.innerHTML = `<h3>Generated Subnets</h3>`;
            const noSubnetsP = document.createElement('p');
            noSubnetsP.textContent = "No subnets could be generated with the given parameters within the original network space.";
            detailedResultsDiv.appendChild(noSubnetsP);
        }
        resultsDiv.appendChild(detailedResultsDiv);
    }

    function appendListItem(ulElement, label, value) {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<strong>${label}:</strong> ${value}`;
        ulElement.appendChild(listItem);
    }

    // --- Event Listener ---
    calculateButton.addEventListener('click', (event) => {
        event.preventDefault();
        const ipAddressStr = ipAddressInput.value.trim();
        const originalMaskStr = subnetMaskInput.value.trim();
        const numSubnetsStr = numSubnetsInput.value.trim();
        const numDevicesStr = numDevicesInput.value.trim();

        let desiredNumSubnets = null;
        let desiredNumDevices = null;
        resultsDiv.innerHTML = '';

        if (numSubnetsStr) {
            desiredNumSubnets = parseInt(numSubnetsStr, 10);
            if (isNaN(desiredNumSubnets) || desiredNumSubnets <= 0) {
                displayResults({ error: "Number of desired subnets must be a positive integer." });
                return;
            }
        }
        if (numDevicesStr) {
            desiredNumDevices = parseInt(numDevicesStr, 10);
            if (isNaN(desiredNumDevices) || desiredNumDevices <= 0) {
                 displayResults({ error: "Number of desired devices must be a positive integer." });
                return;
            }
        }

        if (desiredNumSubnets && desiredNumDevices) {
            displayResults({ error: "Please provide either 'Number of Subnets' OR 'Number of Devices per Subnet', not both." });
            return;
        }

        resultsDiv.textContent = 'Calculating...';
        setTimeout(() => {
            const networkDetails = calculateNetworkDetails(ipAddressStr, originalMaskStr, desiredNumSubnets, desiredNumDevices);
            displayResults(networkDetails);
        }, 10);
    });
});
