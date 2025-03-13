const config = {
		"inbounds": [],
		"outbounds": [
				{
						"mux": {
								"enabled": false
						},
						"protocol": "vless",
						"settings": {
								"vnext": [
										{
												"address": "104.26.15.85",
												"port": 80,
												"users": [
														{
																"encryption": "none",
																"id": "d342d11e-d424-4583-b36e-524ab1f0afa4",
																"level": 8
														}
												]
										}
								]
						},
						"streamSettings": {
								"network": "ws",
								"security": "none",
								"wsSettings": {
										"headers": {
												"Host": "a.xn--i-sx6a60i.us.kg."
										},
										"path": "/?ed\u003dMARAMBASHI_MARAMBASHI/?ed\u003d2560"
								}
						},
						"tag": "VLESS"
				}
		],
		"policy": {
				"levels": {
						"8": {
								"connIdle": 300,
								"downlinkOnly": 1,
								"handshake": 4,
								"uplinkOnly": 1
						}
				}
		}
};

module.exports = config;
