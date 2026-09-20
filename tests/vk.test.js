import {
    messagesURL, siteURL, matchPattern,
    extractAccessToken, apiRequestURL, diffRequestBody, itemsRequestBody,
    parseUnreadCount, parseConversationItems,
} from '../js/vk.js';

describe('vk.js constants', () => {
    it('exposes vk.ru URLs', () => {
        expect(messagesURL).toBe('https://vk.ru/im');
        expect(siteURL).toBe('https://vk.ru');
        expect(matchPattern).toBe('*://*.vk.ru/*');
    });
});

describe('extractAccessToken', () => {
    it('pulls the token out of the embedded webToken script', () => {
        const html = `
            window.vk = {
                apiConfigDomains: {"apiDomain":"api.vk.ru"},
                webToken: {"access_token":"vk1.a.FAKE_TOKEN_VALUE","expired_at":1789914422,"is_anonym":false},
                id: 223712115,
            };
        `;
        expect(extractAccessToken(html)).toBe('vk1.a.FAKE_TOKEN_VALUE');
    });

    it('returns null when there is no token (logged out)', () => {
        expect(extractAccessToken('<html><body>login page</body></html>')).toBeNull();
    });
});

describe('apiRequestURL', () => {
    it('builds a versioned api.vk.ru method URL', () => {
        expect(apiRequestURL('messages.getDiff')).toBe(
            'https://api.vk.ru/method/messages.getDiff?v=5.289&client_id=6287487'
        );
    });
});

describe('request body builders', () => {
    it('diffRequestBody includes the access token and asks for a full snapshot', () => {
        const body = new URLSearchParams(diffRequestBody('TOKEN123'));
        expect(body.get('access_token')).toBe('TOKEN123');
        expect(body.get('lp_version')).toBe('0');
        expect(body.get('conversations_limit')).toBe('0');
    });

    it('itemsRequestBody includes the access token and a fields list', () => {
        const body = new URLSearchParams(itemsRequestBody('TOKEN123'));
        expect(body.get('access_token')).toBe('TOKEN123');
        expect(body.get('extended')).toBe('1');
        expect(body.get('fields')).toContain('first_name');
    });
});

describe('parseUnreadCount', () => {
    it('sums per-folder and channel counts', () => {
        const json = {
            response: {
                counters: {
                    messages_folders: [
                        { folder_id: 2, total_count: 3 },
                        { folder_id: 1, total_count: 0 },
                        { folder_id: 4, total_count: 2 },
                    ],
                    channels: { total_count: 1 },
                },
            },
        };
        expect(parseUnreadCount(json)).toBe(6);
    });

    it('returns -1 when the response has no counters', () => {
        expect(parseUnreadCount({ response: {} })).toBe(-1);
        expect(parseUnreadCount({})).toBe(-1);
    });

    it('returns 0 when every folder is empty', () => {
        const json = { response: { counters: { messages_folders: [{ total_count: 0 }], channels: { total_count: 0 } } } };
        expect(parseUnreadCount(json)).toBe(0);
    });
});

describe('parseConversationItems', () => {
    const baseResponse = {
        response: {
            conversations: {
                items: [
                    {
                        conversation: {
                            peer: { id: 111, type: 'user' },
                            last_message_id: 500,
                            in_read: 490,
                            is_marked_unread: false,
                        },
                        last_message: { text: 'Hey, are you free?', out: 0 },
                    },
                    {
                        conversation: {
                            peer: { id: 222, type: 'user' },
                            last_message_id: 700,
                            in_read: 700,
                            is_marked_unread: false,
                        },
                        last_message: { text: 'Sounds good', out: 1 },
                    },
                    {
                        conversation: {
                            peer: { id: 333, type: 'group' },
                            last_message_id: 10,
                            in_read: 10,
                            is_marked_unread: true,
                        },
                        last_message: { text: 'Community announcement', out: 0 },
                    },
                ],
            },
            profiles: [
                { id: 111, first_name: 'Alice', last_name: 'Ivanova' },
                { id: 222, first_name: 'Bob', last_name: 'Petrov' },
            ],
            groups: [
                { id: 333, name: 'Some Community' },
            ],
        },
    };

    it('marks a conversation unread when the last message (from someone else) is past the read marker', () => {
        const result = parseConversationItems(baseResponse);
        expect(result[0].isUnread).toBe(true);
        expect(result[0].sender).toBe('Alice Ivanova');
        expect(result[0].subject).toBe('Hey, are you free?');
        expect(result[0].href).toBe('https://vk.ru/im?sel=111');
    });

    it('treats a conversation as read when in_read has caught up', () => {
        const result = parseConversationItems(baseResponse);
        expect(result[1].isUnread).toBe(false);
        expect(result[1].sender).toBe('Bob Petrov');
    });

    it('respects is_marked_unread even when in_read has caught up, and resolves group senders', () => {
        const result = parseConversationItems(baseResponse);
        expect(result[2].isUnread).toBe(true);
        expect(result[2].sender).toBe('Some Community');
    });

    it('returns an empty array for a malformed response', () => {
        expect(parseConversationItems({})).toEqual([]);
        expect(parseConversationItems({ response: {} })).toEqual([]);
    });
});
