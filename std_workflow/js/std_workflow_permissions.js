/* Haplo Platform                                     http://haplo.org
 * (c) Haplo Services Ltd 2006 - 2016    http://www.haplo-services.com
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.         */

/* Workflow permission rules look like:

   workflow type, entity name -> permissions for that entity

   workflow type, state -> permissions for actionableBy person in that state

   workflowPermissionsRules is a mapping from workflow names
   (workflow.fullName or workUnit.workType) to objects:

      entityPermissions[entity name] -> permissions string
      stateActionPermissions[state name] -> permissions string
*/

var workflowPermissionRules = {};

// spec is a list of rules
// Rules are either:
// { entity: NAME, hasPermission: PERM }
// { inState: NAME, actionableByHasPermission: PERM }

P.registerWorkflowFeature("std:permissions", function(workflow, spec) {
    var eps = {};
    var saps = {};
    _.each(spec, function(rule) {
        if ("entity" in rule &&
            "hasPermission" in rule) {
            eps[rule.entity] = rule.hasPermission;
        } else if ("inState" in rule &&
            "actionableByHasPermission" in rule) {
            saps[rule.inState] = rule.actionableByHasPermission;
        } else {
            throw "Invalid workflow permissions rule " + JSON.stringify(rule);
        }
    });
    workflowPermissionRules[workflow.fullName] = {
        entityPermissions: eps,
        stateActionPermissions: saps
    };
});

// As actionableBy might be a group, what we return is a list
// of users AND groups. Don't assume it's just users.
var checkPermissionsForObject = function(object, checkFunction) {
    var results = [];
    var objectRef = object.ref;
    _.each(workflowPermissionRules, function(rules, workUnitType) {
        var units = O.work.query(workUnitType).ref(objectRef);
        _.each(units, function(unit) {
            if(P.allWorkflows[unit.workType]) {
                var M = P.allWorkflows[unit.workType].instance(unit);
                // Entity permissions
                _.each(rules.entityPermissions, function(perms, entityName) {
                    if(checkFunction(perms)) {
                        var entities = M.entities[entityName + "_list"];
                        if(entities) {
                            _.each(entities, function(entity) {
                                var user = O.user(entity.ref);
                                if(user) {
                                    results.push(user);
                                }
                            });
                        }
                    }
                });

                // actionableBy permissions
                if(rules.stateActionPermissions[M.state]) {
                    if(checkFunction(rules.stateActionPermissions[M.state])) {
                        results.push(unit.actionableBy);
                    }
                }
            }
        });
    });

    results = _.unique(results, false, function(user) {return user.id;});
    return results;
};

// API to permissions system

P.implementService("std:workflow:get_additional_readers_for_object", function(objectRef) {
    var result = checkPermissionsForObject(objectRef, function(perm) {
        return perm==="read" || perm==="read-edit";
    });
    return result;
});

P.implementService("std:workflow:get_additional_writers_for_object", function(objectRef) {
    var result = checkPermissionsForObject(objectRef, function(perm) {
        return perm==="read-edit";
    });
    return result;
});

// Change notification handlers

P.implementService("std:workflow:entities:replacement_changed", function(workUnit, workflow, entityName) {
    // TODO: Be fussier. This only affects read permissions in practice, as
    // write perms are not cached. See about computing before/after read perms for
    // the object and see if they are actually changed, and do nothing
    // otherwise.
    console.log("Entity replacement occurs!");
    if(O.serviceImplemented("std:workflow:permissions:permissions_changed_for_object")) {
        if(workflowPermissionRules[workUnit.workType]) {
            if(workUnit.ref) {
                O.service("std:workflow:permissions:permissions_changed_for_object",
                          workUnit.ref);
            }
        }
    }
});

P.implementService("std:workflow:transition", function(M, transition, previousState) {
    console.log("Transition occurs!");
    if(O.serviceImplemented("std:workflow:permissions:permissions_changed_for_object")) {
        if(workflowPermissionRules[M.workUnit.workType]) {
            if(M.workUnit.ref) {
                O.service("std:workflow:permissions:permissions_changed_for_object",
                          M.workUnit.ref);
            }
        }
    }
});
