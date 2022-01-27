#!/usr/bin/env node
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */


import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {LogDestinationStack} from '../lib/infrastructure/stacks/stacks';
import {AwsSolutionsChecks} from "cdk-nag";
import {Environment} from "aws-cdk-lib";


const app = new cdk.App();
const env = {
    account: app.node.tryGetContext("account"),
    region: app.node.tryGetContext("region")
}

if (env.account == null || env.region == null) {
    throw Error("Specify account and region via cdk context")
}
const trustedAccountsValue=app.node.tryGetContext("trustedAccounts")
const principalOrgIdsValue=app.node.tryGetContext("principalOrgIds")
const regionsValue=app.node.tryGetContext("regions")
let trustedAccounts:Environment[] | undefined
let principalOrgIds: string[] | undefined
let regions: string[] | undefined
if (trustedAccountsValue != null) {
    if (principalOrgIdsValue != null) {
        throw new Error("You cannot specify both trustedAccounts and principalOrgIds")
    }
    if (regionsValue != null) {
        throw new Error("You cannot specify both trustedAccounts and regions")
    }
    trustedAccounts=(trustedAccountsValue as string).split(",").map(value => {
        const v=value.split(":")
        return {
            account: v[0],
            region: v[1]
        }
    })

} else if (principalOrgIdsValue != null) {
    if (regionsValue == null) {
        throw new Error("You must specify regions when you specify principalOrgIds")
    }
    principalOrgIds=(principalOrgIdsValue as string).split(",")
    regions=(regionsValue as string).split(",")

} else {
    throw new Error("You must specify either trustedAccounts or principalOrgIds and regions")
}


const logDestinationStack=new LogDestinationStack(app, 'LogDestinationStack', {
    env: env,
    trustedAccounts: trustedAccounts,
    principalOrgIds: principalOrgIds,
    regions: regions

});
cdk.Aspects.of(logDestinationStack).add(new AwsSolutionsChecks())