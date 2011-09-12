(function($) {
    // MODULE: wok.pollster

    window.wok = window.wok || {
        version: '1.0',
        error: function(msg) { alert("wok error: " + msg); }
    };
    window.wok.pollster = {
        options: {
            // UI part selectors.
            canvasSelector: "#pollster-canvas",
            propertiesSelector: "#pollster-properties",
            templateClass: "survey",
            questionClass: "question"
        }
    };

    // POLLSTER SURVEY

    function PollsterRuntime(context, options) {
        context = context || document;
        options = $.extend({}, window.wok.pollster.options, options);

        var self = this;
        var $survey = $('.'+options.templateClass, context);
        var questionSelector = '.'+options.questionClass;

        // Useful methods.

        function get_homologous_rules(rule, rules) {
            var filtered = [];
            for (var i=0 ; i < rules.length ; i++) {
                var hr = rules[i];
                if (rule.objectSignature === hr.objectSignature && rule.name === hr.name)
                    filtered.push(hr);
            }
            return filtered;
        }

        // Fill types and rules from generated Javascript code.

        var last_participation_data = pollster_last_participation_data();
        var data_types = {}, open_option_data_types = {}, derived_values = {};
        var rules_by_question = {}, rules_by_object = {};

        pollster_fill_data_types(data_types);
        pollster_fill_open_option_data_types(open_option_data_types);
        pollster_fill_rules(rules_by_question);
        pollster_fill_derived_values(derived_values);
        
        // Fill the "by object" and "state" rule dictionaries.

        for (var q in rules_by_question) {
            // Create a list of all options for current question.

            var not_exclusive_options = [];
            $("#question-"+q+" li").each(function() {
                not_exclusive_options.push(parseInt(($(this).attr("id") || '').replace("option-","")));
            });

            for (var i=0 ; i < rules_by_question[q].length ; i++) {
                var rule = rules_by_question[q][i];
                if (rule.objectSignature !== null) {
                    var target = rules_by_object[rule.objectSignature];
                    if (!target) {
                        target = rules_by_object[rule.objectSignature] = {
                            state: { visibility: [0,0] },
                            rules: []
                        };
                    }
                    target.rules.push(rule);
                }

                // Set the initial active flag for the rule to false.
                rule.active = false;

                // If this is an ExclusiveRule instance remove subject options from the
                // list if not exclusive options; used later to generate an extra ExclusiveRule.

                if (rule.isExclusive) {
                    for (var j=0 ; j < rule.subjectOptions.length ; j++) {
                        var index = not_exclusive_options.indexOf(rule.subjectOptions[j]);
                        if (index >= 0)
                            not_exclusive_options.splice(index, 1);
                    }
                }
            }

            // Create one ExclusiveRule instance for each option that is not already
            // subject of an ExclusiveRule.

            rules_by_question[q].push(new window.wok.pollster.rules.Exclusive(q, not_exclusive_options, {}));
        }

        $survey.find('.open-option-data').attr('disabled', true);
        if (last_participation_data && last_participation_data.timestamp)
            $('.question-builtin [name=timestamp]').val(last_participation_data.timestamp);

        // Bind data types to question elements

        $.each(data_types, function(question, data_type) {
            var $field = $('#question-'+question+'-field');
            data_type.bind($field);
        });

        $.each(open_option_data_types, function(question, option_data_types) {
            $.each(option_data_types, function(option, data_type) {
                var $field = $('#option-'+option+'-field-open');
                data_type.bind($field);
            });
        });

        // Event handlers.

        window.wok.pollster._eh_args = [];
        window.wok.pollster._eh = function() {
            var args = window.wok.pollster._eh_args.pop();
            if (!args) return;

            var evt = args[0];
            var extra = args[1];

            var $input = $(evt.target);

            if ($input.hasClass('open-option-data'))
                return true;
            var $question = $(evt.target).closest(questionSelector);
            if (!$question.length)
                return true;
            var $option = $input.closest("li");
            var isRadio = $input.is(":radio");
            var isText = $input.is(":text");
            var isHidden = $input.is("[type=hidden]");
            var qid = parseInt($question.attr("id").replace("question-",""));
            var oid = parseInt(($option.attr("id") || '').replace("option-",""));
            var checked = false;
            // some checks are disabled on synthetized 'change' event
            var synthetic = extra && extra.synthetic;

            // If the <input> is a checkbox or radio button determine its checked state.

            if ($input.is(":radio,:checkbox")) {
                checked = $input.is(":checked");
                $question.find('.open-option-data').attr('disabled', function(){
                    return !$(this).closest('li').find(":radio,:checkbox").is(':checked');
                });
            }

            // Else check the validity by data type

            else {
                data_type = data_types[qid];
                var valid = data_type.check($input);
                var empty = $input.val() == "";
                var err = !valid || ($question.is('.mandatory') && empty);
                if (!synthetic)
                    $question.toggleClass("error", err);
                checked = !empty;
            }

            // Set the active flag on all rules for this event.

            var rules = rules_by_question[qid] || [];
            var rules_active = [];
            for (var i=0 ; i < rules.length ; i++) {
                var rule = rules[i];
                if (rule.activate($survey, $question, evt))
                    rules_active.push(rule);
            }

            // For every active rule check "required" and "sufficient" conditions
            // for every rule with the same target object and type.

            for (var i=0 ; i < rules_active.length ; i++) {
                var rule = rules_active[i];
                var target = null, hrs = [];
                if (rule.objectSignature !== null) {
                    target = rules_by_object[rule.objectSignature];
                    hrs = get_homologous_rules(rule, target.rules);
                }

                // If the current rule was switched to active we just apply it if
                // sufficient, but if necessary we need to make sure all other
                // necessary rules are active too.

                if (rule.active) {
                    var apply = true;
                    if (!rule.isSufficient) {
                        for (var j=0 ; j < hrs.length ; j++) {
                            if (!hrs[j].isSufficient && !hrs[j].active)
                                apply = false;
                        }
                    }
                    if (apply)
                        rule.apply($survey, target);
                }

                // If the current rule was switched to inactive we do as above
                // but the logic is inverted.

                else {
                    var apply = true;
                    if (rule.isSufficient) {
                        for (var j=0 ; j < hrs.length ; j++) {
                            if (hrs[j].isSufficient && hrs[j].active)
                                apply = false;
                        }
                    }
                    if (apply)
                        rule.apply($survey, target);
                }
            }

            // Propagate changes to derived options.

            if ($input.is(':not(.derived)')) {
                var val = $input.val();
                var derived = derived_values[qid] || [];
                for (var i=0 ; i < derived.length ; i++) {
                    var $derived_input = $question.find('#option-'+derived[i].option).find(':input');
                    var match = Boolean(derived[i].match(val));
                    var checked = $derived_input.is(':checked');
                    if (match != checked) {
                        $derived_input.attr('checked', match).trigger('change', { synthetic: true });
                    }
                }
            }
        };

        $survey.find("input").change(function(evt, extra) {
            if (evt.target.nodeName !== "INPUT")
                return;
            window.wok.pollster._eh_args.push([evt, extra]);
            //setTimeout("window.wok.pollster._eh()", 1);
            window.wok.pollster._eh();
        });

        jQuery.each(rules_by_question, function(i, by_question) {
            jQuery.each(by_question, function(i, rule) {
                rule.init($survey, last_participation_data);
            });
        });

        // Ensure that the initial status is consistent with rules and whatnot.

        $survey.find(":input").trigger('change', { synthetic: true });
    }

    // MODULE FUNCTIONS

    window.wok.pollster.createPollsterRuntime = function(context, options) {
        return new PollsterRuntime(context, options);
    };

})(jQuery);

