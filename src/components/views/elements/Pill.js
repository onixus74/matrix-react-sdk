/*
Copyright 2017 Vector Creations Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import React from 'react';
import sdk from '../../../index';
import classNames from 'classnames';
import { Room, RoomMember } from 'matrix-js-sdk';
import PropTypes from 'prop-types';
import MatrixClientPeg from '../../../MatrixClientPeg';
import { MATRIXTO_URL_PATTERN } from '../../../linkify-matrix';
import { getDisplayAliasForRoom } from '../../../Rooms';

const REGEX_MATRIXTO = new RegExp(MATRIXTO_URL_PATTERN);

// For URLs of matrix.to links in the timeline which have been reformatted by
// HttpUtils transformTags to relative links
const REGEX_LOCAL_MATRIXTO = /^#\/(?:user|room)\/(([\#\!\@\+]).*)$/;

const Pill = React.createClass({
    statics: {
        isPillUrl: (url) => {
            return !!REGEX_MATRIXTO.exec(url);
        },
        isMessagePillUrl: (url) => {
            return !!REGEX_LOCAL_MATRIXTO.exec(url);
        },
        TYPE_USER_MENTION: 'TYPE_USER_MENTION',
        TYPE_ROOM_MENTION: 'TYPE_ROOM_MENTION',
    },

    props: {
        // The URL to pillify (no validation is done, see isPillUrl and isMessagePillUrl)
        url: PropTypes.string,
        // Whether the pill is in a message
        inMessage: PropTypes.bool,
        // The room in which this pill is being rendered
        room: PropTypes.instanceOf(Room),
    },

    getInitialState() {
        return {
            // ID/alias of the room/user
            resourceId: null,
            // Type of pill
            pillType: null,

            // The member related to the user pill
            member: null,
            // The room related to the room pill
            room: null,
        };
    },

    componentWillMount() {
        this._unmounted = false;
        let regex = REGEX_MATRIXTO;
        if (this.props.inMessage) {
            regex = REGEX_LOCAL_MATRIXTO;
        }

        // Default to the empty array if no match for simplicity
        // resource and prefix will be undefined instead of throwing
        const matrixToMatch = regex.exec(this.props.url) || [];

        const resourceId = matrixToMatch[1]; // The room/user ID
        const prefix = matrixToMatch[2]; // The first character of prefix

        const pillType = {
            '@': Pill.TYPE_USER_MENTION,
            '#': Pill.TYPE_ROOM_MENTION,
            '!': Pill.TYPE_ROOM_MENTION,
        }[prefix];

        let member;
        let room;
        switch (pillType) {
            case Pill.TYPE_USER_MENTION: {
                const localMember = this.props.room.getMember(resourceId);
                member = localMember;
                if (!localMember) {
                    member = new RoomMember(null, resourceId);
                    this.doProfileLookup(resourceId, member);
                }
            }
                break;
            case Pill.TYPE_ROOM_MENTION: {
                const localRoom = resourceId[0] === '#' ?
                    MatrixClientPeg.get().getRooms().find((r) => {
                        return r.getAliases().includes(resourceId);
                    }) : MatrixClientPeg.get().getRoom(resourceId);
                room = localRoom;
                if (!localRoom) {
                    // TODO: This would require a new API to resolve a room alias to
                    // a room avatar and name.
                    // this.doRoomProfileLookup(resourceId, member);
                }
            }
                break;
        }
        this.setState({resourceId, pillType, member, room});
    },

    componentWillUnmount() {
        this._unmounted = true;
    },

    doProfileLookup: function(userId, member) {
        MatrixClientPeg.get().getProfileInfo(userId).then((resp) => {
            if (this._unmounted) {
                return;
            }
            member.name = resp.displayname;
            member.rawDisplayName = resp.displayname;
            member.events.member = {
                getContent: () => {
                    return {avatar_url: resp.avatar_url};
                },
            };
            this.setState({member});
        }).catch((err) => {
            console.error('Could not retrieve profile data for ' + userId + ':', err);
        });
    },

    render: function() {
        const MemberAvatar = sdk.getComponent('avatars.MemberAvatar');
        const RoomAvatar = sdk.getComponent('avatars.RoomAvatar');

        const resource = this.state.resourceId;

        let avatar = null;
        let linkText = resource;
        let pillClass;
        let userId;
        switch (this.state.pillType) {
            case Pill.TYPE_USER_MENTION: {
                    // If this user is not a member of this room, default to the empty member
                    const member = this.state.member;
                    if (member) {
                        userId = member.userId;
                        linkText = member.name;
                        avatar = <MemberAvatar member={member} width={16} height={16}/>;
                        pillClass = 'mx_UserPill';
                    }
            }
                break;
            case Pill.TYPE_ROOM_MENTION: {
                const room = this.state.room;
                if (room) {
                    linkText = (room ? getDisplayAliasForRoom(room) : null) || resource;
                    avatar = <RoomAvatar room={room} width={16} height={16}/>;
                    pillClass = 'mx_RoomPill';
                }
            }
                break;
        }

        const classes = classNames(pillClass, {
            "mx_UserPill_me": userId === MatrixClientPeg.get().credentials.userId,
        });

        if (this.state.pillType) {
            return this.props.inMessage ?
                <a className={classes} href={this.props.url} title={resource}>
                    {avatar}
                    {linkText}
                </a> :
                <span className={classes} title={resource}>
                    {avatar}
                    {linkText}
                </span>;
        } else {
            // Deliberately render nothing if the URL isn't recognised
            return null;
        }
    },
});

export default Pill;
