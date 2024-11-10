<?php
set_time_limit(0); // Infinite execution time
ob_implicit_flush(); // Flush output buffer immediately

$address = '127.0.0.1'; // Server address
$port = 8080; // Port for WebSocket server

// Creating TCP/IP socket
$socket = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
if ($socket === false) {
    echo "Error creating socket: " . socket_strerror(socket_last_error()) . "\n";
    exit;
}

// Binding socket to address and port
if (socket_bind($socket, $address, $port) === false) {
    echo "Error binding socket: " . socket_strerror(socket_last_error()) . "\n";
    exit;
}

// Listening for connections
if (socket_listen($socket, 5) === false) {
    echo "Error listening on socket: " . socket_strerror(socket_last_error()) . "\n";
    exit;
}

echo "WebSocket server started at ws://$address:$port\n";

// Array to store all client connections
$clients = [];

while (true) {
    // Create a copy of clients array for reading
    $read = [$socket];
    $write = null;
    $except = null;

    // Add all connected clients to the read array
    foreach ($clients as $client) {
        $read[] = $client;
    }

    // Use socket_select to monitor all connections
    $num_changed_sockets = socket_select($read, $write, $except, null);

    if ($num_changed_sockets === false) {
        echo "socket_select() failed: " . socket_strerror(socket_last_error()) . "\n";
        break;
    }

    // Check for new incoming connection
    if (in_array($socket, $read)) {
        $client = socket_accept($socket);
        if ($client === false) {
            echo "Error accepting connection: " . socket_strerror(socket_last_error()) . "\n";
            continue;
        }

        // Perform WebSocket handshake
        $request = socket_read($client, 1024);
        if ($request) {
            preg_match("/Sec-WebSocket-Key: (.*)\r\n/", $request, $matches);
            $secWebSocketKey = trim($matches[1]);

            $acceptKey = base64_encode(sha1($secWebSocketKey . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', true));
            $response = "HTTP/1.1 101 Switching Protocols\r\n"
                . "Upgrade: websocket\r\n"
                . "Connection: Upgrade\r\n"
                . "Sec-WebSocket-Accept: $acceptKey\r\n\r\n";
            
            socket_write($client, $response);
            echo "New client connected\n";
            $clients[] = $client; // Add the new client to the list
        }
    }

    // Handle messages from existing clients
    foreach ($clients as $key => $client) {
        if (in_array($client, $read)) {
            $data = socket_read($client, 1024);
            if ($data === false) {
                // Connection closed or error reading data
                echo "Client disconnected\n";
                unset($clients[$key]);
                socket_close($client);
                continue;
            } else {
                // Handle the WebSocket frame (decode, process and send a response)
                try {
                    $message = decodeWebSocketMessage($data);
                    echo "Received message: $message\n";

                    // Encode the message to send back
                    $response = encodeWebSocketMessage($message);

                    // Broadcast to all clients except the sender
                    foreach ($clients as $broadcastClient) {
                        if ($broadcastClient !== $client) { // Skip sending to the sender
                            socket_write($broadcastClient, $response);
                        }
                    }
                } catch (Exception $e) {
                    echo "Error decoding WebSocket message: " . $e->getMessage() . "\n";
                }
            }
        }
    }
}

// Close the server socket when finished
socket_close($socket);

// Function to decode WebSocket frame
function decodeWebSocketMessage($data) {
    $len = ord($data[1]) & 127; // Extract length of the message
    $mask = ord($data[1]) >> 7; // Check for masking (WebSocket frames use masking)
    
    // If length is 126 or 127, handle extended length
    if ($len === 126) {
        $len = unpack('n', substr($data, 2, 2))[1];
    } elseif ($len === 127) {
        $len = unpack('J', substr($data, 2, 8))[1];
    }

    // Extract mask key and message content
    $maskKey = substr($data, 2 + ($len === 126 ? 2 : ($len === 127 ? 8 : 0)), 4);
    $message = substr($data, 2 + ($len === 126 ? 2 : ($len === 127 ? 8 : 0)) + 4, $len);

    // Unmask the message
    $message = unmaskMessage($message, $maskKey);

    // Validate UTF-8 encoding
    if (!isValidUtf8($message)) {
        throw new Exception('Could not decode a text frame as UTF-8.');
    }

    return $message;
}

// Function to check if the string is valid UTF-8
function isValidUtf8($str) {
    return mb_detect_encoding($str, 'UTF-8', true) !== false;
}

// Function to unmask WebSocket message
function unmaskMessage($message, $maskKey) {
    $unmasked = '';
    for ($i = 0; $i < strlen($message); $i++) {
        $unmasked .= chr(ord($message[$i]) ^ ord($maskKey[$i % 4]));
    }
    return $unmasked;
}

// Function to encode WebSocket message
function encodeWebSocketMessage($message) {
    $length = strlen($message);
    $frame = chr(0x81); // Final frame, Text frame
    if ($length <= 125) {
        $frame .= chr($length);
    } elseif ($length >= 126 && $length <= 65535) {
        $frame .= chr(126) . pack('n', $length);
    } else {
        $frame .= chr(127) . pack('J', $length);
    }
    return $frame . $message;
}
?>
